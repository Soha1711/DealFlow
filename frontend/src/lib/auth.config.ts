import type { NextAuthConfig } from "next-auth";

/**
 * Base Auth.js configuration shared between the Node.js application and the
 * edge-compatible `proxy.ts`. It deliberately avoids importing the database or
 * credentials provider so the proxy layer can stay dependency-light.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  // Only trust the request host when explicitly enabled (e.g. AUTH_TRUST_HOST=true
  // in .env for local development behind a non-Vercel host).
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  providers: [],
} satisfies NextAuthConfig;