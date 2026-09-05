import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { Brand } from "@/components/app-shell/brand";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Sign in · DealFlow360",
};

const errorMessages: Record<string, string> = {
  CredentialsSignin: "Invalid email or password. Please try again.",
  Configuration: "Authentication is not configured correctly.",
  default: "Something went wrong while signing in.",
};

function DemoAccounts() {
  const accounts = [
    { role: "Administrator", email: "avery.stone@dealflow360.io" },
    { role: "Sales Manager", email: "ravi.patel@dealflow360.io" },
    { role: "Sales Rep", email: "maya.chen@dealflow360.io" },
    { role: "Finance", email: "priya.nair@dealflow360.io" },
    { role: "Operations", email: "diego.ramos@dealflow360.io" },
    { role: "Customer", email: "jordan.lee@dealflow360.io" },
  ];
  const password = "DealFlow360!";

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle className="text-sm">Demo access</CardTitle>
        <CardDescription>
          Seed credentials. Use the password{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{password}</code>{" "}
          for every account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {accounts.map((account) => (
            <li
              key={account.email}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate text-muted-foreground">{account.role}</span>
              <span className="truncate font-medium text-foreground">
                {account.email}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error, callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="mb-6">
        <Brand />
      </div>

      <div className="w-full max-w-sm">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-lg">Welcome back</CardTitle>
            <CardDescription>
              Sign in to continue to DealFlow360 Sales Operations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm
              callbackUrl={callbackUrl}
              initialError={error ? errorMessages[error] ?? errorMessages.default : undefined}
            />
          </CardContent>
        </Card>

        <div className="my-4 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">demo workspace</span>
          <Separator className="flex-1" />
        </div>
        <DemoAccounts />
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        DealFlow360 · Intelligent sales operations for the modern B2B team
      </p>
    </main>
  );
}