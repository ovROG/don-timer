export type DaStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "auth_error"
  | "error"
  | "offline";

export type DaStatusSnapshot = {
  status: DaStatus;
  /** Open timer pages keeping the connection alive. */
  viewers: number;
  lastError: string | null;
  lastDisconnectReason: string | null;
  lastDonationAt: number | null;
  since: number;
};

export const daStatusView: Record<DaStatus, { label: string; color: string }> =
  {
    connecting: { label: "Подключение…", color: "yellow" },
    connected: { label: "Подключено", color: "green" },
    reconnecting: { label: "Переподключение…", color: "yellow" },
    auth_error: { label: "Ошибка авторизации, перезайдите", color: "red" },
    error: { label: "Ошибка подключения", color: "red" },
    offline: { label: "Не подключено", color: "gray" },
  };
