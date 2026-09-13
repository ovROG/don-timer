import { Badge, Pagination, Stack, Table, Text } from "@mantine/core";
import { useSearchParams } from "@remix-run/react";

type Log = {
  id: string;
  timestamp: Date;
  text: string | null;
  source: string | null;
  timer: { name: string | null } | null;
};

interface Props {
  logs: Log[];
  page: number;
  totalPages: number;
}

export const LogsTable = ({ logs, page, totalPages }: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <Stack align="center">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th>
            <Table.Th>Source</Table.Th>
            <Table.Th>Timer</Table.Th>
            <Table.Th>Message</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {logs.map((log) => {
            return (
              <Table.Tr key={log.id}>
                <Table.Td>{log.timestamp.toLocaleString()}</Table.Td>
                <Table.Td>
                  {log.source && (
                    <Badge variant="light" color="gray">
                      {log.source}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{log.timer?.name}</Table.Td>
                <Table.Td>{log.text}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {logs.length === 0 && <Text c="dimmed">Пусто</Text>}
      <Pagination
        total={totalPages}
        value={page}
        onChange={(next) => {
          const params = new URLSearchParams(searchParams);
          params.set("page", String(next));
          setSearchParams(params);
        }}
      />
    </Stack>
  );
};
