import {
  AppShell,
  Group,
  Title,
  Menu,
  Avatar,
  ActionIcon,
  Text,
} from "@mantine/core";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate } from "@remix-run/react";
import { utils } from "~/utils.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await utils.checkAuth(request);
  return user;
}

export default function DashboardLayout() {
  const user = useLoaderData<typeof loader>();

  const navigate = useNavigate();

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title>Chronation</Title>
          <Menu shadow="md">
            <Menu.Target>
              <ActionIcon variant="outline" size="xl" radius="xl" color="red">
                <Avatar src={user.avatar}>{user.name}</Avatar>
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.name}</Menu.Label>
              <Menu.Divider />
              <Menu.Item
                color="red"
                rightSection={<SignOut />}
                onClick={() => {
                  navigate("/auth/logout");
                }}
              >
                <Text fw={700}>Logout</Text>
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>
      <AppShell.Main pos="relative">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
