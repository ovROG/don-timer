import { client } from "redis/client.server";

export const timerService = {
  new: async (id: string) => {
    return client
      .multi()
      .hSet(id, {
        remaining: 300000, // 5 min
        status: TimerState.Paused,
      } as TimerData)
      .sAdd(TimerState.Paused, id)
      .exec();
  },
  delete: async (id: string) => {
    return client
      .multi()
      .del(id)
      .sRem(TimerState.Paused, id)
      .sRem(TimerState.Expired, id)
      .sRem(TimerState.Running, id)
      .exec();
  },
  set: async (id: string, remaining: number) => {
    const result = await client.hSet(id, "remaining", remaining);
    await client.publish(`upd:${id}`, result.toString());
    return result;
  },
  add: async (id: string, add: number) => {
    const result = client.hIncrBy(id, "remaining", add);
    await client.publish(`upd:${id}`, result.toString());
    return result;
  },
  sub: async (id: string, sub: number) => {
    const result = await client.hIncrBy(id, "remaining", -sub);
    if (result <= 0) {
      await timerService.expire(id);
      return 0;
    }
    await client.publish(`upd:${id}`, result.toString());
    return result;
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
      .publish(`sts:${id}`, TimerState.Expired)
      .exec();
  },
  tick: async (dt: number) => {
    const runningIds = await client.sMembers(TimerState.Running);
    await Promise.all(
      runningIds.map(async (id) => {
        const result = await client.hIncrBy(id, "remaining", dt);
        if (result <= 0) {
          await timerService.expire(id);
          return;
        }
        await client.publish(`upd:${id}`, result.toString());
      })
    );
  },
};

export enum TimerState {
  Running = "Running",
  Paused = "Paused",
  Expired = "Expired",
}

export type TimerData = {
  status: TimerState;
  remaining: number;
};
