"use client";

import Link from "next/link";
import { signupAction } from "@/app/actions/auth";
import {
  AuthFormFields,
  AuthFormPendingScreen,
  AuthFormSubmitButton,
} from "@/components/auth-form-controls";

const inputClassName =
  "rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

type Props = {
  error: string | null;
  message: string | null;
};

export function SignupForm({ error, message }: Props) {
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

      {message ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {message}
        </p>
      ) : null}

      <form action={signupAction} className="mt-6 flex flex-col gap-4">
        <AuthFormPendingScreen message="Creating your account…" />
        <AuthFormFields className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Display name <span className="font-normal text-splice-blue">(optional)</span>
            <input name="display_name" type="text" autoComplete="name" className={inputClassName} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Email
            <input name="email" type="email" autoComplete="email" required className={inputClassName} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Password <span className="font-normal text-splice-blue">(min 8 characters)</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputClassName}
            />
          </label>
        </AuthFormFields>
        <AuthFormSubmitButton idleLabel="Create account" pendingLabel="Creating account…" />
      </form>

      <p className="mt-6 text-center text-sm text-splice-ocean dark:text-splice-water">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-splice-blue underline dark:text-splice-water">
          Log in
        </Link>
      </p>
    </>
  );
}
