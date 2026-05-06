import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Race Manager
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Club racing foundation: sailors, club admin, and race officer flows—starting with
            accounts and profiles.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
          >
            Log in
          </Link>
          <Link
            href="/groups"
            className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
          >
            Groups
          </Link>
          <Link
            href="/account"
            className="rounded-lg border border-transparent px-5 py-2.5 text-sm font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
          >
            Account
          </Link>
        </div>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Developers
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Status probe:{" "}
            <Link href="/health" className="font-medium text-blue-600 dark:text-blue-400">
              /health
            </Link>{" "}
            · JSON:{" "}
            <Link href="/api/health" className="font-medium text-blue-600 dark:text-blue-400">
              /api/health
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
