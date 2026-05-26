import Link from "next/link";
import { signupAction } from "@/app/actions/auth";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;
  const message = q.message ? decodeURIComponent(q.message) : null;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-md rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          Sign up
        </h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Create an account. If email confirmation is enabled in Supabase, you must confirm before
          signing in.
        </p>

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
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Display name <span className="font-normal text-splice-blue">(optional)</span>
            <input
              name="display_name"
              type="text"
              autoComplete="name"
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Password <span className="font-normal text-splice-blue">(min 8 characters)</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-splice-ocean dark:text-splice-water">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-splice-blue underline dark:text-splice-water">
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}
