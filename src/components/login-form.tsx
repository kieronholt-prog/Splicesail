"use client";

import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import {
  AuthFormFields,
  AuthFormPendingScreen,
  AuthFormSubmitButton,
} from "@/components/auth-form-controls";

const inputClassName =
  "rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

type Props = {
  error: string | null;
};

export function LoginForm({ error }: Props) {
  return (
    <>
      {error ? (
        <p
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <form action={loginAction} className="mt-6 flex flex-col gap-4">
        <AuthFormPendingScreen message="Signing in…" />
        <AuthFormFields className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Email
            <input name="email" type="email" autoComplete="email" required className={inputClassName} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClassName}
            />
          </label>
        </AuthFormFields>
        <AuthFormSubmitButton idleLabel="Log in" pendingLabel="Signing in…" />
      </form>

      <p className="mt-6 text-center text-sm text-splice-ocean dark:text-splice-water">
        No account?{" "}
        <Link href="/signup" className="font-medium text-splice-blue underline dark:text-splice-water">
          Sign up
        </Link>
      </p>
    </>
  );
}
