import { db } from "database/client.server";
import { usersTable } from "database/schema.server";
import { redirect } from "@remix-run/node";
import { eq } from "drizzle-orm";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { appSessionStorage } from "./services/auth.server";

const getSessionUserId = async (request: Request) => {
  const session = await appSessionStorage.getSession(
    request.headers.get("cookie")
  );
  const userId: unknown = session.get("userId");
  return typeof userId === "number" ? userId : null;
};

const checkAuth = async (request: Request) => {
  const userId = await getSessionUserId(request);
  if (userId === null) throw redirect("/");

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: {
      id: true,
      name: true,
      avatar: true,
      timers_limit: true,
      is_admin: true,
    },
  });
  if (!user) throw redirect("/auth/logout");
  return user;
};

const checkAdmin = async (request: Request) => {
  const user = await checkAuth(request);
  if (!user.is_admin) throw redirect("/");
  return user;
};

const parsePage = (request: Request) => {
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
};

// remix-serve ignores X-Forwarded-Proto, so behind nginx request.url is always http.
const publicOrigin = (request: Request) => {
  const url = new URL(request.url);
  const proto = request.headers.get("X-Forwarded-Proto")?.split(",")[0].trim();
  if (proto === "http" || proto === "https") url.protocol = `${proto}:`;
  return url.origin;
};

export const utils = {
  getSessionUserId,
  checkAuth,
  checkAdmin,
  parsePage,
  publicOrigin,
  encryptCuid2: (cuid2: string) => {
    const iv = randomBytes(16);
    const cipher = createCipheriv(
      "aes-256-cbc",
      Buffer.from(process.env.AES_KEY!).subarray(0, 32),
      iv
    );
    const encrypted = cipher.update(cuid2, "utf8", "base64");
    return { val: encrypted + cipher.final("base64"), iv: iv.toString("hex") };
  },
  decryptCuid2: (encrypted: string, ivHex: string) => {
    const iv = Buffer.from(ivHex, "hex");
    const decipher = createDecipheriv(
      "aes-256-cbc",
      Buffer.from(process.env.AES_KEY!).subarray(0, 32),
      iv
    );
    const decrypted = decipher.update(encrypted, "base64", "utf8");
    return decrypted + decipher.final("utf8");
  },
};
