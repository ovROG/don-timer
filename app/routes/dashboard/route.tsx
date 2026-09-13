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
  Container,
} from "@mantine/core";
import {
  Moon,
  Notebook,
  Plugs,
  PlugsConnected,
  RowsPlusBottom,
  Siren,
  Sun,
} from "@phosphor-icons/react/dist/ssr";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useNavigate } from "@remix-run/react";
import { CustomSvg } from "~/svg";
import { utils } from "~/utils.server";

import styles from "./route.module.css";
import { daEventSystem } from "~/services/donation.server";
import { daStatusView } from "~/da-status";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await utils.checkAuth(request);
  const donationLink = process.env.DONATION_LINK!;
  const da = daEventSystem.getStatus(user.id);
  return { user, donationLink, da };
}

export default function DashboardLayout() {
  const { user, donationLink, da } = useLoaderData<typeof loader>();
  const daView = daStatusView[da.status];
  const daIconColor = `var(--mantine-color-${daView.color}-filled)`;

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
                <Menu.Label>{user.name} </Menu.Label>
                <Menu.Label>
                  DonationAlerts:{" "}
                  {da.status === "connected" ? (
                    <PlugsConnected
                      color={daIconColor}
                      weight="fill"
                      style={{ verticalAlign: "middle" }}
                    />
                  ) : (
                    <Plugs
                      color={daIconColor}
                      weight="fill"
                      style={{ verticalAlign: "middle" }}
                    />
                  )}{" "}
                  {daView.label}
                </Menu.Label>
                <Menu.Divider />
                {user.is_admin && (
                  <Menu.Item
                    leftSection={<Siren />}
                    onClick={() => {
                      navigate("/admin");
                    }}
                  >
                    <Text fw={700}>Admin Panel</Text>
                  </Menu.Item>
                )}
                <Menu.Item
                  leftSection={<RowsPlusBottom />}
                  onClick={() => {
                    navigate("/dashboard");
                  }}
                >
                  <Text fw={700}>Dashboard</Text>
                </Menu.Item>
                <Menu.Item
                  leftSection={<Notebook />}
                  onClick={() => {
                    navigate("/dashboard/logs");
                  }}
                >
                  <Text fw={700}>Logs</Text>
                </Menu.Item>
                <Menu.Item
                  color="red"
                  leftSection={<SignOut />}
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
        <Container>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
