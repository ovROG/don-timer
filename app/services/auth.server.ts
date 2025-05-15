import { createCookieSessionStorage } from "@remix-run/node";
import { db } from "database/client.server";
import { usersTable } from "database/schema.server";
import { Authenticator } from "remix-auth";
import { OAuth2Strategy } from "remix-auth-oauth2";
import { daApiClient, daAuthProvider } from "./donation.server";

export const appSessionStorage = createCookieSessionStorage({
  cookie: {
    name: "chronation",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.COOKIES_SALT!],
    secure: process.env.NODE_ENV === "production",
  },
});

export const authenticator = new Authenticator<
  typeof usersTable.$inferSelect
>();

authenticator.use(
  new OAuth2Strategy(
    {
      clientId: process.env.DA_CLIENT_ID!,
      clientSecret: process.env.DA_CLIENT_SECRET!,

      authorizationEndpoint: "https://www.donationalerts.com/oauth/authorize",
      tokenEndpoint: "https://www.donationalerts.com/oauth/token",
      redirectURI: process.env.DA_REDIRECT!,

      scopes: ["oauth-user-show", "oauth-donation-subscribe"],
    },
    async ({ tokens }) => {
      const tokensAndId = await daAuthProvider.addUserForToken({
        accessToken: tokens.accessToken(),
        refreshToken: tokens.refreshToken(),
        expiresIn: tokens.accessTokenExpiresInSeconds(),
        obtainmentTimestamp: Date.now(),
      });

      const userData = await daApiClient.users.getUser(tokensAndId.userId);

      const user: typeof usersTable.$inferInsert = {
        id: userData.id,
        name: userData.name,
        avatar: userData.avatar,
        token: tokensAndId.accessToken,
        refresh_token: tokensAndId.refreshToken,
        da_socket_token: userData.socketConnectionToken,
        expiresIn: tokensAndId.expiresIn,
        obtainmentTimestamp: tokensAndId.obtainmentTimestamp,
      };

      const db_user = await db
        .insert(usersTable)
        .values(user)
        .onConflictDoUpdate({
          target: usersTable.id,
          set: {
            name: user.name,
            avatar: user.avatar,
            token: user.token,
            refresh_token: user.refresh_token,
            da_socket_token: user.da_socket_token,
            expiresIn: tokensAndId.expiresIn,
            obtainmentTimestamp: tokensAndId.obtainmentTimestamp,
          },
        })
        .returning();

      return db_user[0];
    }
  ),
  "donationalerts"
);
