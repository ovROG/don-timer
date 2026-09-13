import { Button, Fieldset, Stack, Table } from "@mantine/core";
import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { currencyService } from "~/services/currency.server";
import { utils } from "~/utils.server";

import styles from "./route.module.css";
import { timerService } from "~/services/timer.server";
import { db } from "database/client.server";
import { inArray } from "drizzle-orm";
import { timersTable, usersTable } from "database/schema.server";
import { daEventSystem } from "~/services/donation.server";
import { DaStatusBadge } from "~/components/DaStatusBadge";

export async function loader({ request }: LoaderFunctionArgs) {
  await utils.checkAdmin(request);

  const rates = currencyService.rates;
  const lastRateUpdate = currencyService.lastUpdate;

  const activeIds = await timerService.active();

  const activeTimers = await db.query.timersTable.findMany({
    where: inArray(timersTable.id, activeIds),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          avatar: true,
        },
      },
    },
  });

  const connections = daEventSystem.list();
  const connectionUsers = await db.query.usersTable.findMany({
    where: inArray(
      usersTable.id,
      connections.map((connection) => connection.userId)
    ),
    columns: { id: true, name: true },
  });
  const daConnections = connections.map((connection) => ({
    ...connection,
    userName:
      connectionUsers.find((user) => user.id === connection.userId)?.name ??
      String(connection.userId),
  }));

  return { rates, lastRateUpdate, activeTimers, daConnections };
}

export async function action({ request }: ActionFunctionArgs) {
  await utils.checkAdmin(request);
  const data = await request.formData();
  const userId = Number(data.get("userId"));
  if (Number.isInteger(userId)) daEventSystem.reconnect(userId);
  return null;
}

export default function Admin() {
  const { rates, lastRateUpdate, activeTimers, daConnections } =
    useLoaderData<typeof loader>();

  return (
    <Stack align="center" h="100%">
      <Fieldset legend="DonationAlerts" h="30dvh" className={styles.ratesBox}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Pages</Table.Th>
              <Table.Th>Last donation</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {daConnections.map((connection) => {
              return (
                <Table.Tr key={connection.userId}>
                  <Table.Td>{connection.userName}</Table.Td>
                  <Table.Td>
                    <DaStatusBadge status={connection} />
                  </Table.Td>
                  <Table.Td>{connection.viewers}</Table.Td>
                  <Table.Td>
                    {connection.lastDonationAt
                      ? new Date(connection.lastDonationAt).toLocaleString()
                      : "—"}
                  </Table.Td>
                  <Table.Td>
                    <Form method="post">
                      <input
                        type="hidden"
                        name="userId"
                        value={connection.userId}
                      />
                      <Button size="xs" variant="light" type="submit">
                        Reconnect
                      </Button>
                    </Form>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Fieldset>

      <Fieldset
        legend={`Rates (${lastRateUpdate?.toLocaleString()})`}
        h="30dvh"
        className={styles.ratesBox}
      >
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Rate</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rates.map((valute) => {
              return (
                <Table.Tr key={valute.NumCode}>
                  <Table.Td>{valute.Name}</Table.Td>
                  <Table.Td>{valute.VunitRate}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Fieldset>

      <Fieldset legend={`Active Timers`} h="30dvh" className={styles.ratesBox}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>User</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {activeTimers.map((timer) => {
              return (
                <Table.Tr key={timer.id}>
                  <Table.Td>{timer.id}</Table.Td>
                  <Table.Td>{timer.user?.name}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Fieldset>
    </Stack>
  );
}
