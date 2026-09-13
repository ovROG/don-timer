import { Badge, Tooltip } from "@mantine/core";
import { DaStatusSnapshot, daStatusView } from "~/da-status";

export const DaStatusBadge = ({ status }: { status: DaStatusSnapshot }) => {
  const view = daStatusView[status.status];
  const details = status.lastError ?? status.lastDisconnectReason;

  return (
    <Tooltip label={details} disabled={!details} multiline maw={320}>
      <Badge color={view.color} variant="light">
        {view.label}
      </Badge>
    </Tooltip>
  );
};
