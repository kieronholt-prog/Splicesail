/** Client event: primary fleet start saved from RO start-signals panel. */
export const RO_PRIMARY_START_SAVED_EVENT = "splice-race-primary-start-saved";

export type RoPrimaryStartSavedDetail = { scheduledAtIso: string };

export function dispatchRoPrimaryStartSaved(scheduledAtIso: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<RoPrimaryStartSavedDetail>(RO_PRIMARY_START_SAVED_EVENT, {
      detail: { scheduledAtIso },
    }),
  );
}
