"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AuthFormFields,
  AuthFormPendingScreen,
  AuthFormSubmitButton,
} from "@/components/auth-form-controls";
import { resolvePostAuthRedirectPathForUser } from "@/lib/post-auth-redirect";
import { createClient } from "@/lib/supabase/client";

const inputClassName =
  "rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam";

type Props = {
  error: string | null;
};

export function LoginForm({ error: initialError }: Props) {
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    const password = String(new FormData(form).get("password") ?? "");

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        setPending(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Signed in but session was not established. Please try again.");
        setPending(false);
        return;
      }

      const path = await resolvePostAuthRedirectPathForUser(supabase, user.id);
      window.location.assign(path);
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

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

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <AuthFormPendingScreen message="Signing in…" pending={pending} />
        <AuthFormFields className="flex flex-col gap-4" pending={pending}>
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
        <AuthFormSubmitButton idleLabel="Log in" pendingLabel="Signing in…" pending={pending} />
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
