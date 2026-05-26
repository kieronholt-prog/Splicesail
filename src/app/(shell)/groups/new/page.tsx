import Link from "next/link";
import { createGroupAction } from "@/app/actions/groups";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewGroupPage({ searchParams }: Props) {
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-md rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          New group
        </h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          You become <strong className="font-medium text-splice-navy-light dark:text-splice-sky">club admin</strong>{" "}
          once the Splice team approves this club. You&apos;ll get an email when it&apos;s ready.
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
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Name
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. Wembley Sailing Club"
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Short name <span className="font-normal text-splice-blue">(optional)</span>
            <input
              name="slug"
              type="text"
              placeholder="e.g. wembley-sc"
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Create group
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link href="/groups" className="text-splice-blue underline dark:text-splice-water">
            Cancel
          </Link>
        </p>
      </main>
    </div>
  );
}
