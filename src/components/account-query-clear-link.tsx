"use client";

import Link from "next/link";

type Props = { href?: string };

/** Clears URL query notices by replacing history with a bare path (e.g. `/account`, `/groups/…/club-admin`). */
export function AccountQueryClearLink({ href = "/account" }: Props) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      prefetch={false}
      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-splice-water bg-white px-3 py-2 text-xs font-medium text-splice-ocean transition hover:bg-splice-surface dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-sky dark:hover:bg-splice-navy"
    >
      Clear
    </Link>
  );
}
