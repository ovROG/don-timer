import type { LimitMode } from "database/schema.server";
import { client } from "redis/client.server";
import { TimerData, TimerState } from "redis/types";

export type TimerLimit = { limit_mode: LimitMode; limit_time: number | null };

const NO_LIMIT: TimerLimit = { limit_mode: "none", limit_time: null };

// Lua keeps each read-modify-write atomic. The scripts also touch the state
// sets, which aren't declared as keys; that is fine on a single Redis instance.
const EXPIRE_FN = `
local function expire(id)
  redis.call('HSET', id, 'remaining', '0', 'status', 'Expired')
  redis.call('SADD', 'Expired', id)
  redis.call('SREM', 'Running', id)
  redis.call('SREM', 'Paused', id)
  redis.call('PUBLISH', 'upd:' .. id, '0')
  redis.call('PUBLISH', 'sts:' .. id, 'Expired')
end
`;

// Upper bound for the remaining time, or false when the timer has no limit.
const CAP_FN = `
local function cap(id, mode, limit)
  if mode == 'remaining' then return limit end
  if mode == 'total' then
    return limit - (tonumber(redis.call('HGET', id, 'elapsed')) or 0)
  end
  return false
end
`;

// KEYS[1]: timer id; ARGV[1]: elapsed ms. Returns 1 when the timer expired.
const TICK_SCRIPT = `${EXPIRE_FN}
local id = KEYS[1]
if redis.call('HGET', id, 'status') ~= 'Running' then
  redis.call('SREM', 'Running', id)
  return 0
end
local dt = tonumber(ARGV[1])
local before = tonumber(redis.call('HGET', id, 'remaining')) or 0
redis.call('HINCRBYFLOAT', id, 'elapsed', tostring(math.min(dt, math.max(before, 0))))
local remaining = tonumber(redis.call('HINCRBYFLOAT', id, 'remaining', tostring(-dt)))
if remaining <= 0 then
  expire(id)
  return 1
end
redis.call('PUBLISH', 'upd:' .. id, tostring(remaining))
return 0
`;

// KEYS[1]: timer id; ARGV: delta ms, limit mode, limit ms.
// Returns {remaining, applied delta}, or nil when the timer is gone.
const ADD_SCRIPT = `${EXPIRE_FN}${CAP_FN}
local id = KEYS[1]
if redis.call('EXISTS', id) == 0 then return false end
local delta = tonumber(ARGV[1])
local remaining = tonumber(redis.call('HGET', id, 'remaining')) or 0
if delta > 0 then
  local upper = cap(id, ARGV[2], tonumber(ARGV[3]))
  if upper then delta = math.max(0, math.min(delta, upper - remaining)) end
end
if delta == 0 then return {tostring(remaining), '0'} end
remaining = tonumber(redis.call('HINCRBYFLOAT', id, 'remaining', tostring(delta)))
if remaining <= 0 then
  expire(id)
  return {'0', tostring(delta)}
end
redis.call('PUBLISH', 'upd:' .. id, tostring(remaining))
return {tostring(remaining), tostring(delta)}
`;

// KEYS[1]: timer id; ARGV: remaining ms, limit mode, limit ms.
// Returns the stored remaining time, or nil when the timer is gone.
const SET_SCRIPT = `${CAP_FN}
local id = KEYS[1]
if redis.call('EXISTS', id) == 0 then return false end
local remaining = math.max(0, tonumber(ARGV[1]))
local upper = cap(id, ARGV[2], tonumber(ARGV[3]))
if upper then remaining = math.max(0, math.min(remaining, upper)) end
redis.call('HSET', id, 'remaining', tostring(remaining))
redis.call('PUBLISH', 'upd:' .. id, tostring(remaining))
return tostring(remaining)
`;

const limitArgs = ({ limit_mode, limit_time }: TimerLimit) =>
  limit_mode === "none" || limit_time === null
    ? ["none", "0"]
    : [limit_mode, limit_time.toString()];

export const timerService = {
  new: async (id: string) => {
    return client
      .multi()
      .hSet(id, {
        remaining: 300000, // 5 min
        elapsed: 0,
        status: TimerState.Paused,
      } as TimerData)
      .sAdd(TimerState.Paused, id)
      .exec();
  },
  delete: async (id: string) => {
    return (
      client
        .multi()
        .del(id)
        .sRem(TimerState.Paused, id)
        .sRem(TimerState.Expired, id)
        .sRem(TimerState.Running, id)
        // Open streams of the timer close on this.
        .publish(`del:${id}`, "")
        .exec()
    );
  },
  /** Stores the remaining time clamped to the limit; returns it, or null when the timer is gone. */
  set: async (id: string, remaining: number, limit: TimerLimit = NO_LIMIT) => {
    const result = await client.eval(SET_SCRIPT, {
      keys: [id],
      arguments: [remaining.toString(), ...limitArgs(limit)],
    });
    return result === null ? null : Number(result);
  },
  /** Positive deltas are cut to the limit. Returns the new remaining time and the delta actually applied, or null when the timer is gone. */
  add: async (id: string, delta: number, limit: TimerLimit = NO_LIMIT) => {
    const result = (await client.eval(ADD_SCRIPT, {
      keys: [id],
      arguments: [delta.toString(), ...limitArgs(limit)],
    })) as unknown as [string, string] | null;
    return result && { remaining: Number(result[0]), applied: Number(result[1]) };
  },
  elapsed: async (id: string) => {
    return Number((await client.hGet(id, "elapsed")) ?? 0);
  },
  resetElapsed: async (id: string) => {
    return client.hSet(id, "elapsed", 0);
  },
  start: async (id: string) => {
    return client
      .multi()
      .hSet(id, "status", TimerState.Running)
      .sAdd(TimerState.Running, id)
      .sRem(TimerState.Paused, id)
      .sRem(TimerState.Expired, id)
      .publish(`sts:${id}`, TimerState.Running)
      .exec();
  },
  pause: async (id: string) => {
    return client
      .multi()
      .hSet(id, "status", TimerState.Paused)
      .sAdd(TimerState.Paused, id)
      .sRem(TimerState.Running, id)
      .sRem(TimerState.Expired, id)
      .publish(`sts:${id}`, TimerState.Paused)
      .exec();
  },
  expire: async (id: string) => {
    return client
      .multi()
      .hSet(id, {
        remaining: 0,
        status: TimerState.Expired,
      })
      .sAdd(TimerState.Expired, id)
      .sRem(TimerState.Running, id)
      .sRem(TimerState.Paused, id)
      .publish(`upd:${id}`, "0")
      .publish(`sts:${id}`, TimerState.Expired)
      .exec();
  },
  /** Counts every running timer down by dt ms; returns the ids that expired. */
  tick: async (dt: number) => {
    const runningIds = await client.sMembers(TimerState.Running);
    const results = await Promise.all(
      runningIds.map((id) =>
        client.eval(TICK_SCRIPT, { keys: [id], arguments: [dt.toString()] })
      )
    );
    return runningIds.filter((_, i) => results[i] === 1);
  },
  active: async () => {
    const runningIds = await client.sMembers(TimerState.Running);
    return runningIds;
  },
};
