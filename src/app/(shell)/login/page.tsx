import { LoginForm } from "@/components/login-form";

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

        <LoginForm error={error} />
      </main>
    </div>
  );
}
