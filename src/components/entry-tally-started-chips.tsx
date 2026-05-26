/** Width for Afloat + Ashore + On line in one row (finish badge column). */
export const ENTRY_STATUS_CHIPS_ROW_W_CLASS = "w-[9.125rem]";

/** Uniform min height for RO entry tiles (sail, class, chips, helm/finish or footer). */
export const RO_ENTRY_BADGE_MIN_H_CLASS = "min-h-[7rem]";

const addedBadgeChipClass = (compact: boolean) =>
  `${
    compact
      ? "min-w-0 flex-[2] basis-0 truncate px-0.5 text-center text-[8px]"
      : "px-1 text-[9px]"
  } rounded py-px font-semibold uppercase leading-none tracking-wide bg-violet-800 text-white dark:bg-violet-300 dark:text-violet-950`;

export function EntryTallyStartedChips({
  tallyAfloatAt,
  tallyAshoreAt,
  startedMarkedAt,
  nowrap = false,
  /** When set (e.g. +ADDED), replaces Afloat and Ashore chips; On line is still shown. */
  addedBadgeLabel,
}: {
  tallyAfloatAt: string | null;
  tallyAshoreAt: string | null;
  startedMarkedAt: string | null;
  /** Keep three chips on one row (finish badges). */
  nowrap?: boolean;
  addedBadgeLabel?: string | null;
}) {
  const chipBase = (ok: boolean, compact: boolean) =>
    `${
      compact
        ? "min-w-0 flex-1 basis-0 truncate px-0.5 text-center text-[8px]"
        : "px-1 text-[9px]"
    } rounded py-px font-semibold uppercase leading-none tracking-wide ${
      ok
        ? "bg-emerald-600/90 text-white dark:bg-emerald-700"
        : "bg-splice-sky text-splice-water dark:bg-splice-ocean dark:text-splice-blue"
    }`;

  const rowClass = nowrap
    ? "flex w-full min-w-0 max-w-full flex-nowrap gap-0.5"
    : `flex flex-wrap gap-1 ${ENTRY_STATUS_CHIPS_ROW_W_CLASS}`;

  if (addedBadgeLabel) {
    return (
      <div className={rowClass} role="group" aria-label={`${addedBadgeLabel}; start line status`}>
        <span className={addedBadgeChipClass(nowrap)} role="status">
          {addedBadgeLabel}
        </span>
        <span className={chipBase(Boolean(startedMarkedAt), nowrap)} title="Seen in start area by race officer">
          On line
        </span>
      </div>
    );
  }

  return (
    <div className={rowClass} role="group" aria-label="Tally and start status for this entry">
      <span className={chipBase(Boolean(tallyAfloatAt), nowrap)} title="Tallied afloat on Home">
        Afloat
      </span>
      <span className={chipBase(Boolean(tallyAshoreAt), nowrap)} title="Tallied ashore on Home">
        Ashore
      </span>
      <span className={chipBase(Boolean(startedMarkedAt), nowrap)} title="Seen in start area by race officer">
        On line
      </span>
    </div>
  );
}
