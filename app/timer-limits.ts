import type { LimitMode } from "database/schema.server";

export const limitModes: { value: LimitMode; label: string; hint: string }[] = [
  {
    value: "none",
    label: "Без лимита",
    hint: "Время на таймере не ограничено",
  },
  {
    value: "remaining",
    label: "Лимит времени на таймере",
    hint: "На таймере не может быть больше лимита, лишнее время не добавляется",
  },
  {
    value: "total",
    label: "Лимит общего времени",
    hint: "Прошедшее и оставшееся время вместе не могут превышать лимит",
  },
];

export const isLimitMode = (value: unknown): value is LimitMode =>
  limitModes.some((mode) => mode.value === value);
