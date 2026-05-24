import Link from "next/link";
import type { HomeTrackNotification } from "@/lib/home-track-notifications";

export function HomeTrackNotificationsBanner({ items }: { items: HomeTrackNotification[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={
            item.kind === "ready"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          }
        >
          {item.kind === "ready" ? (
            <>
              Track analysis ready
              {item.activity_name ? ` — ${item.activity_name}` : ""}.{" "}
              <Link href={`/tracks/${item.id}/analysis`} className="font-medium underline">
                View analysis
              </Link>
            </>
          ) : (
            <>
              Track submitted for fleet analysis
              {item.activity_name ? ` — ${item.activity_name}` : ""}. Waiting for race officer course setup.{" "}
              <Link href={`/tracks/${item.id}?step=pending_ro`} className="font-medium underline">
                Details
              </Link>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
