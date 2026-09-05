import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    customerId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      customerId?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    id?: string;
    customerId?: string | null;
  }
}

export {};