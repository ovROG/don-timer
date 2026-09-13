import { Box, Container, NavLink, Stack } from "@mantine/core";
import { Siren, Users } from "@phosphor-icons/react/dist/ssr";
import { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, NavLink as RNavLink } from "@remix-run/react";
import { utils } from "~/utils.server";

import styles from "./route.module.css";

export async function loader({ request }: LoaderFunctionArgs) {
  await utils.checkAdmin(request);
  return null;
}

export default function Admin() {
  return (
    <Box className={styles.container}>
      <Stack gap="0" flex="0">
        <NavLink href="/admin" label="Admin" leftSection={<Siren />} />
        <NavLink
          to="/admin/users"
          label="Users"
          leftSection={<Users />}
          component={RNavLink}
        />
      </Stack>

      <Container>
        <Outlet />
      </Container>
    </Box>
  );
}
