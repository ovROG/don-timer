import { Duration } from "dayjs/plugin/duration";

export const timeFormatting = {
  format: (time: Duration, ft: string) => {
    const h = Math.trunc(time.asHours());
    const m = time.minutes();
    const s = time.seconds();
    let formeted = "";
    ft.split(/(\[.*?\])/g).forEach((sub, i) => {
      if (i % 2 === 0) {
        formeted += sub
          .replaceAll(/hh/gi, h.toString())
          .replaceAll(/h/gi, h > 0 ? h.toString() : "")
          .replaceAll(/mm/gi, m.toString().padStart(2, "0"))
          .replaceAll(/m/gi, m.toString())
          .replaceAll(/ss/gi, s.toString().padStart(2, "0"))
          .replaceAll(/s/gi, s.toString());
      } else {
        formeted += sub.substring(1, sub.length - 1);
      }
    });
    return formeted;
  },
  /** Compact duration for log messages, e.g. "1h 5m 3s". */
  short: (ms: number) => {
    const total = Math.round(ms / 1000);
    const h = Math.trunc(total / 3600);
    const m = Math.trunc((total % 3600) / 60);
    const s = total % 60;
    return [h && `${h}h`, m && `${m}m`, (s || total === 0) && `${s}s`]
      .filter(Boolean)
      .join(" ");
  },
};
