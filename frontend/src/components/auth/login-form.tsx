"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({
  initialError,
  callbackUrl,
}: {
  initialError?: string;
  callbackUrl?: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(initialError ?? null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);

    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      setFormError("Invalid email or password. Please try again.");
      return;
    }

    const destination =
      callbackUrl &&
      callbackUrl.startsWith("/") &&
      !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/dashboard";
    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {formError && (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900">
          <TriangleAlert className="size-4 text-red-700" aria-hidden />
          <AlertTitle className="text-red-900">Sign-in failed</AlertTitle>
          <AlertDescription className="text-red-800/80">{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-red-700">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-red-700">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting && (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        )}
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}