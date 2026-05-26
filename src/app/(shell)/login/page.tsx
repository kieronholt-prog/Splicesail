import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-md rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          Log in
        </h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Use the email and password for your Splice account.
        </p>

        {error ? (
          <p
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <form action={loginAction} className="mt-6 flex flex-col gap-4">
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
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Log in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-splice-ocean dark:text-splice-water">
          No account?{" "}
          <Link href="/signup" className="font-medium text-splice-blue underline dark:text-splice-water">
            Sign up
          </Link>
        </p>
      </main>
    </div>
  );
}
