export enum TimerState {
  Running = "Running",
  Paused = "Paused",
  Expired = "Expired",
}

export type TimerData = {
  status: TimerState;
  remaining: number;
  /** Time counted down while running; used by the total limit. */
  elapsed: number;
};