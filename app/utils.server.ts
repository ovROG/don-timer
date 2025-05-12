import { usersTable } from "database/schema.server";
import { appSessionStorage } from "./services/auth.server";
import { redirect } from "@remix-run/node";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const utils = {
  checkAuth: async (request: Request) => {
    const session = await appSessionStorage.getSession(
      request.headers.get("cookie")
    );

    const user = session.get("user") as typeof usersTable.$inferSelect;
    if (!user) throw redirect("/");
    return user;
  },
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
