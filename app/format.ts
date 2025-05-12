export const format = {
  formatMs: (ms: number) => {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;
    const milliseconds = ms % 1000;

    return {
      hours,
      minutes,
      seconds,
      milliseconds,
    } as FormatedTime;
  },
};

export interface FormatedTime {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}
