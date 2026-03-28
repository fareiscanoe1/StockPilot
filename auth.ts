import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { env } from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  /** Must never be undefined — process.env.AUTH_SECRET is unset when omitted from .env */
  secret: env.AUTH_SECRET,
  trustHost: true,
});
