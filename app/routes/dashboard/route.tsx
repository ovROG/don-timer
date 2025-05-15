import {
  AppShell,
  Group,
  Menu,
  Avatar,
  ActionIcon,
  Text,
  Indicator,
  UnstyledButton,
  useMantineColorScheme,
  useComputedColorScheme,
  Button,
} from "@mantine/core";
import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useNavigate } from "@remix-run/react";
import { CustomSvg } from "~/svg";
import { utils } from "~/utils.server";

import styles from "./route.module.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await utils.checkAuth(request);
  const donationLink = process.env.DONATION_LINK!;
  return { user, donationLink };
}

export default function DashboardLayout() {
  const { user, donationLink } = useLoaderData<typeof loader>();

  const navigate = useNavigate();

  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("dark", {
    getInitialValueInEffect: true,
  });

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <UnstyledButton to="/dashboard" component={Link}>
            <Indicator label="alpha" color="red" offset={15} size={15}>
              <CustomSvg.logo />
            </Indicator>
          </UnstyledButton>
          <Group>
            <Button
              variant="subtle"
              color="gray"
              href={donationLink}
              target="_blank"
              component="a"
            >
              Поддержать
            </Button>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() =>
                setColorScheme(
                  computedColorScheme === "light" ? "dark" : "light"
                )
              }
            >
              <Sun className={styles.light} />
              <Moon className={styles.dark} />
            </ActionIcon>
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
        </Group>
      </AppShell.Header>
      <AppShell.Main pos="relative">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
