import { Button, Text } from "@mantine/core";
import styles from "./route.module.css";
import { CustomSvg } from "~/svg";
import { Link } from "@remix-run/react";
import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { appSessionStorage } from "~/services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await appSessionStorage.getSession(
    request.headers.get("cookie")
  );

  const user = session.get("user");

  if (user) return redirect("/dashboard");
  return null;
}

export default function Index() {
  return (
    <div className={styles.mainScreen}>
      <div className={styles.bg}></div>
      <div className={styles.content}>
        <div className={styles.left}>
          <CustomSvg.logo className={styles.logo} />
          <Text ta="center">
            Таймер для этих ваших донатонов.{" "}
            <Text span size="xs">
              (alpha ver.)
            </Text>
          </Text>
          <Text ta="center" size="xs">
            <Text
              span
              inherit
              component="a"
              c="red"
              href="https://ovrog.ru"
              target="_blank"
            >
              ovROG
            </Text>{" "}
            2025 &copy;
          </Text>
        </div>
        <div className={styles.right}>
          <Button to="/auth/login" fullWidth color="red" component={Link}>
            Войти через DonationAlerts
          </Button>
        </div>
      </div>
    </div>
  );
}
