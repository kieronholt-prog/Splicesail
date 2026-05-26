import { SignupForm } from "@/components/signup-form";

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

        <SignupForm error={error} message={message} />
      </main>
    </div>
  );
}
