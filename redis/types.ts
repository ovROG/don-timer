export enum TimerState {
  Running = "Running",
  Paused = "Paused",
  Expired = "Expired",
}

export type TimerData = {
  status: TimerState;
  remaining: number;
};