"use client";

import { undoRemoveBoatFromFleetAction } from "@/app/actions/boats";

export function FleetUndoRetireBoatForm({ boatId, fullWidth }: { boatId: string; fullWidth?: boolean }) {
  return (
    <form
      action={undoRemoveBoatFromFleetAction}
      className={fullWidth ? "block w-full" : "inline-flex shrink-0"}
      onSubmit={(e) => {
        if (!confirm("Return this hull to your active fleet? You can attach it to series again.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="boat_id" value={boatId} />
      <button
        type="submit"
        className={`inline-flex rounded-lg border border-emerald-600/40 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-600/25 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-100 dark:hover:bg-emerald-900/60 ${fullWidth ? "w-full justify-center py-2.5 text-sm" : "shrink-0 whitespace-nowrap"}`}
      >
        Undo Remove
      </button>
    </form>
  );
}
