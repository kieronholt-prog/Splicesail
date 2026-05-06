import Link from "next/link";
import { createGroupAction } from "@/app/actions/groups";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewGroupPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          New group
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          You become <strong className="font-medium text-zinc-800 dark:text-zinc-200">club admin</strong>{" "}
          for this organisation.
        </p>

        {error ? (
          <p
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <form action={createGroupAction} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. Wembley Sailing Club"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Slug <span className="font-normal text-zinc-500">(optional, URL-friendly)</span>
            <input
              name="slug"
              type="text"
              placeholder="e.g. wembley-sc"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create group
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link href="/groups" className="text-blue-600 underline dark:text-blue-400">
            Cancel
          </Link>
        </p>
      </main>
    </div>
  );
}
