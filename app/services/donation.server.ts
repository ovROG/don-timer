import { RefreshingAuthProvider } from "@donation-alerts/auth";
import { ApiClient } from "@donation-alerts/api";
import { db } from "database/client.server";
import { usersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import {
  DonationAlertsDonationEvent,
  UserEventsClient,
} from "@donation-alerts/events";

export const daAuthProvider = new RefreshingAuthProvider({
  clientId: process.env.DA_CLIENT_ID!,
  clientSecret: process.env.DA_CLIENT_SECRET!,
  redirectUri: process.env.DA_REDIRECT!,
  scopes: ["oauth-user-show", "oauth-donation-subscribe"],
});

daAuthProvider.onRefresh((id, token) => {
  db.update(usersTable)
    .set({
      token: token.accessToken,
      refresh_token: token.refreshToken,
      expiresIn: token.expiresIn,
      obtainmentTimestamp: token.obtainmentTimestamp,
    })
    .where(eq(usersTable.id, id));
});

export const daApiClient = new ApiClient({
  authProvider: daAuthProvider,
});

export const daEventSystem = {
  listners: new Map<number, { client: UserEventsClient; count: number }>(),
  addListner: async (
    id: number,
    callback: (event: DonationAlertsDonationEvent) => void
  ) => {
    if (daEventSystem.listners.has(id)) {
      const data = daEventSystem.listners.get(id)!;
      data.count += 1;
      return data.client;
    }

    const userEventsClient = new UserEventsClient({
      user: id,
      apiClient: daApiClient,
    });

    await userEventsClient.onDonation(callback);

    userEventsClient.onConnect(() => {
      console.log(`DA Connected! ${id}`);
    });
    userEventsClient.onDisconnect(() => {
      console.log(`DA Disconnected! ${id}`);
    });

    daEventSystem.listners.set(id, { client: userEventsClient, count: 1 });
    return userEventsClient;
  },
  removeListner: async (id: number) => {
    if (daEventSystem.listners.has(id)) {
      const data = daEventSystem.listners.get(id)!;
      data.count -= 1;
      if (data.count <= 0) {
        await data.client.disconnect(true);
        daEventSystem.listners.delete(id);
      }
    }
  },
};
