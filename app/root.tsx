import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";
import {
  ColorSchemeScript,
  createTheme,
  mantineHtmlProps,
  MantineProvider,
  Stack,
  Title,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap",
  },
];

const theme = createTheme({
  fontFamily: "Manrope",
});

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="icon"
          type="image/png"
          href="/favicon-96x96.png"
          sizes="96x96"
        />
        <link rel="icon" type="image/svg+xml" href="favicon.svg" />
        <ColorSchemeScript />
        <Meta />
        <Links />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <Notifications />
          {children}
        </MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <Stack align="stretch" justify="center">
        <Title c="red" ta="center" fw={800}>
          {error.status} (Ошибочка)
        </Title>
        <Title c="red" ta="center" fw={800}>
          {error.statusText}
        </Title>
      </Stack>
    );
  }
  return (
    <Stack align="stretch" justify="center">
      <Title c="red" ta="center" fw={800}>
        500 (Ошибочка)
      </Title>
      <Title c="red" ta="center" fw={800}>
        Ой! Это не по плану!
      </Title>
    </Stack>
  );
}
