"use client";

import { removeBoatFromFleetAction } from "@/app/actions/boats";

export function FleetRemoveBoatForm({
  boatId,
  variant = "row",
}: {
  boatId: string;
  variant?: "row" | "edit";
}) {
  const btnClass =
    variant === "edit"
      ? "mt-2 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/45 dark:text-red-100 dark:hover:bg-red-950/70"
      : "inline-flex shrink-0 whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/45 dark:text-red-100 dark:hover:bg-red-950/70";

  return (
    <form
      action={removeBoatFromFleetAction}
      className={variant === "edit" ? "contents" : "inline-flex shrink-0"}
      onSubmit={(e) => {
        if (
          !confirm(
            "Remove this boat from your fleet?\n\n• If it has no race history on the system, it will be deleted.\n• If it has race history, it will be retired — you can undo from My boats under “Retired hulls”.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="boat_id" value={boatId} />
      <button type="submit" className={btnClass}>
        {variant === "edit" ? "Delete / Remove boat" : "Remove"}
      </button>
    </form>
  );
}
