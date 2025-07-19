import { Fieldset, Stack, Table } from "@mantine/core";
import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { currencyService } from "~/services/currency.server";
import { utils } from "~/utils.server";

import styles from "./route.module.css";
import { timerService } from "~/services/timer.server";
import { db } from "database/client.server";
import { inArray } from "drizzle-orm";
import { timersTable } from "database/schema.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await utils.checkAuth(request);

  //todo: maybe check with db
  if (!user.is_admin) {
    return redirect(`/`);
  }

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

  return { rates, lastRateUpdate, activeTimers };
}

export default function Admin() {
  const { rates, lastRateUpdate, activeTimers } =
    useLoaderData<typeof loader>();

  return (
    <Stack align="center" h="100%">
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
