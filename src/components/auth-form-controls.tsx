"use client";

import { useFormStatus } from "react-dom";

function AuthFormSpinner() {
  return (
    <svg
      aria-hidden
      className="size-8 animate-spin text-splice-blue dark:text-splice-water"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/** Covers the whole viewport while a server auth action runs (hides stale nav + form). */
export function AuthFormPendingScreen({
  message,
  pending: pendingOverride,
}: {
  message: string;
  pending?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingOverride ?? formPending;
  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-splice-navy/50 px-4 backdrop-blur-sm dark:bg-black/55"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-splice-sky bg-white px-8 py-6 text-center shadow-lg dark:border-splice-navy-light dark:bg-splice-navy">
        <AuthFormSpinner />
        <p className="text-sm font-medium text-splice-navy dark:text-splice-surface">{message}</p>
      </div>
    </div>
  );
}

export function AuthFormFields({
  children,
  className = "",
  pending: pendingOverride,
}: {
  children: React.ReactNode;
  className?: string;
  pending?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingOverride ?? formPending;
  return (
    <div
      className={`${className}${pending ? " pointer-events-none opacity-60" : ""}`}
      aria-busy={pending || undefined}
    >
      {children}
    </div>
  );
}

export function AuthFormSubmitButton({
  idleLabel,
  pendingLabel,
  className = "mt-2 rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white transition hover:bg-splice-navy-light disabled:cursor-wait disabled:opacity-80 dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky",
  pending: pendingOverride,
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  pending?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingOverride ?? formPending;

  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
