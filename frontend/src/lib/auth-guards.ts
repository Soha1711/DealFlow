import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { hasAreaAccess, type AppArea } from "@/lib/rbac";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  customerId?: string | null;
};

/**
 * Returns the authenticated user for the current request, or `null` when no
 * valid session exists. Memoized per request via React `cache`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user) return null;

  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    customerId: session.user.customerId ?? null,
  };
});

/** Throws a redirect to the login page when the request is unauthenticated. */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Throws a redirect to the dashboard when the request is unauthenticated or
 * when the user's role is not permitted in the given application area.
 */
export async function requireAreaAccess(area: AppArea): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (!hasAreaAccess(user.role, area)) {
    redirect("/dashboard");
  }
  return user;
}