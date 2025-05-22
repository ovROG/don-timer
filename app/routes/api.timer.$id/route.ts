import { DonationAlertsDonationEvent } from "@donation-alerts/events";
import { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "database/client.server";
import { timersTable, usersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { client } from "redis/client.server";
import { TimerData } from "redis/types";
import { eventStream } from "remix-utils/sse/server";
import { currencyService } from "~/services/currency.server";
import { daAuthProvider, daEventSystem } from "~/services/donation.server";
import { timerService } from "~/services/timer.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id;

  if (!id) {
    throw new Response(id, {
      status: 500,
      statusText: "No timer ID",
    });
  }

  const timer = await db.query.timersTable.findFirst({
    where: eq(timersTable.id, id),
  });

  if (!timer || !timer.user_id) {
    throw new Response(id, {
      status: 500,
      statusText: "No timer or owner id",
    });
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, timer.user_id),
  });

  if (!user) {
    throw new Response(id, {
      status: 500,
      statusText: "No owner",
    });
  }

  if (!daAuthProvider.hasUser(timer.user_id)) {
    daAuthProvider.addUser(timer.user_id, {
      accessToken: user.token,
      refreshToken: user.refresh_token,
      expiresIn: user.expiresIn ?? 0,
      obtainmentTimestamp: user.obtainmentTimestamp ?? 0,
    });
  }

  try {
    const onDonation = async (e: DonationAlertsDonationEvent) => {
      const curr_timer = await db.query.timersTable.findFirst({
        where: eq(timersTable.id, id),
      });

      const rate = curr_timer!.time / curr_timer!.price;
      if (e.currency === "RUB") {
        const t = e.amount * rate;
        timerService.add(id, t);
      } else {
        const t = currencyService.convert(e.currency, e.amount) * rate;
        timerService.add(id, t);
      }
    };

    await daEventSystem.addListner(timer.user_id, onDonation);
  } catch (e) {
    console.log(e);
  }

  return eventStream(request.signal, (send) => {
    const suber = client.duplicate();

    suber.on("ready", async () => {
      await suber.hGetAll(id).then((raw) => {
        const data = raw as TimerData;
        send({
          event: "init",
          data: JSON.stringify(data),
        });
      });

      await suber.subscribe(`upd:${id}`, (message) => {
        send({ event: "upd", data: message });
      });
      await suber.subscribe(`sts:${id}`, (message) => {
        send({ event: "sts", data: message });
      });
    });

    suber.connect();

    return async () => {
      if (suber.isReady) {
        await suber.unsubscribe();
        await suber.quit();
      }
      try {
        await daEventSystem.removeListner(timer.user_id!);
      } catch (e) {
        console.log(e);
      }
    };
  });
}
