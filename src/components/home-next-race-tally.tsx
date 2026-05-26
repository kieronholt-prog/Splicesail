"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  tallyAfloatAction,
  tallyAshoreAction,
  undoTallyAfloatAction,
} from "@/app/actions/race-entries";
import {
  HomeAmendRaceDetailsButton,
  type HomeAmendRaceTarget,
} from "@/components/home-amend-race-details";
import { MarineSignalFlagImg } from "@/components/marine-signal-flag-img";
import {
  marineFlagKeyFromClassFlag,
  pennantCharForDisplay,
} from "@/lib/marine-signal-flags";
import {
  isRoOnlyFinishOutcome,
  roOnlyFinishOutcomeLabel,
} from "@/lib/finish-outcome-labels";
import { fleetStartUtcMs } from "@/lib/tally-window";

/** Base row computed on the server; panel adds formatted status strings. */
export type HomeBoatTallyRow = {
  boatId: string;
  label: string;
  fleetOffsetMinutes: number;
  tally_afloat_at: string | null;
  tally_ashore_at: string | null;
  outcome: string | null;
};

export type HomeTalliedAfloatListItem = {
  boatLabel: string;
  sailDisplay: string;
  helmDisplay: string;
  talliedAtDisplay: string;
};

export type PursuitTallySlotDisplay = {
  startDisplay: string;
  classLabels: string;
  isViewerSlot: boolean;
  viewerTalliedAfloat: boolean;
  /** Sail numbers or em dash for entries in this slot. */
  sailCells: string[];
};

export type HomeBoatTallyPanelRow = HomeBoatTallyRow & {
  afloatLoggedDisplay: string;
  ashoreLoggedDisplay: string;
  outcomeSummaryDisplay: string;
  amendDetails: { ctx: HomeAmendRaceTarget; crewEditable: boolean } | null;
  fleetId: string | null;
  fleetName: string | null;
  clubClassFlag: string | null;
  classStartDisplay: string;
  boatTypeDisplay: string;
  sailNumberDisplay: string;
  talliedAfloatList: HomeTalliedAfloatListItem[];
  /** When set, Tally List shows pursuit start sheet instead of tallied-only list. */
  pursuitTallySlots?: PursuitTallySlotDisplay[];
};

function BoatTallyHeaderRow({ row }: { row: HomeBoatTallyPanelRow }) {
  const hasClassStrip = !!(
    row.fleetName ||
    row.clubClassFlag ||
    (row.classStartDisplay && row.classStartDisplay !== "—")
  );

  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <p className="min-w-0 flex-1 text-left text-sm leading-snug">
        <span className="font-semibold text-splice-navy dark:text-splice-surface">{row.label}</span>
        {row.boatTypeDisplay !== "—" ? (
          <span className="text-splice-ocean dark:text-splice-water"> · {row.boatTypeDisplay}</span>
        ) : null}
        {row.sailNumberDisplay !== "—" ? (
          <span className="tabular-nums text-splice-ocean dark:text-splice-water"> · {row.sailNumberDisplay}</span>
        ) : null}
      </p>
      {hasClassStrip ? (
        <div
          className="flex shrink-0 items-center gap-1.5"
          title={row.fleetName ?? undefined}
        >
          <HomeFleetClassFlag clubClassFlag={row.clubClassFlag} fleetName={row.fleetName} />
          {row.classStartDisplay && row.classStartDisplay !== "—" ? (
            <span className="text-[10px] font-semibold tabular-nums text-splice-navy dark:text-splice-foam">
              {row.classStartDisplay}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HomeFleetClassFlag({
  clubClassFlag,
  fleetName,
}: {
  clubClassFlag: string | null;
  fleetName: string | null;
}) {
  const flagKey = marineFlagKeyFromClassFlag(clubClassFlag);
  if (flagKey) {
    return (
      <span className="block h-7 w-7 shrink-0" title={fleetName ?? undefined} aria-hidden>
        <MarineSignalFlagImg
          flagKey={flagKey}
          alt=""
          className="h-7 w-7 rounded-sm object-contain opacity-95 ring-1 ring-inset ring-black/10 dark:ring-white/15"
        />
      </span>
    );
  }
  const ch = pennantCharForDisplay(null, fleetName ?? "");
  if (!ch && !fleetName) return null;
  return (
    <span
      className="flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-sm border border-splice-ocean bg-amber-200 px-1 text-[10px] font-bold text-splice-navy shadow-sm dark:border-splice-water dark:bg-amber-400/90"
      title={fleetName ?? undefined}
      aria-hidden
    >
      {ch || "—"}
    </span>
  );
}

function BoatTallyActions({
  amendDetails,
  showAmendOverlay,
  children,
}: {
  amendDetails: HomeBoatTallyPanelRow["amendDetails"];
  showAmendOverlay: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`relative mt-3 min-w-0${amendDetails && showAmendOverlay ? " pt-10" : ""}`}>
      {amendDetails && showAmendOverlay ? (
        <div className="absolute right-2 top-2 z-10">
          <HomeAmendRaceDetailsButton
            ctx={amendDetails.ctx}
            crewEditable={amendDetails.crewEditable}
            embedded
          />
        </div>
      ) : null}
      {children}
    </div>
  );
}

const AFLOAT_PRIMARY_BTN_H = "h-[4.75rem]";

const BIG_BTN =
  `rounded-xl px-6 py-5 text-lg font-semibold tracking-tight transition shadow-sm ${AFLOAT_PRIMARY_BTN_H}`;

/** Undo control in the 50% column — smaller type so it matches the tallied panel visual balance */
const UNDO_BTN =
  `rounded-xl px-3 py-4 text-sm font-semibold leading-tight tracking-tight transition shadow-sm ${AFLOAT_PRIMARY_BTN_H} sm:px-4 sm:text-base`;

/** Amend / compact ashore action — matches Undo / second column width in the paired row layout */
const AMEND_BTN = UNDO_BTN;

/**
 * Equal two-column rows use flex + flex-1 basis-0 + min-w-0 (Safari grid often lets the first column
 * size to max-content and steal the row). Fixed height matches `BIG_BTN` primary “Tally Afloat” control.
 */
/** Green Tallied Afloat / Tally afloat — same 90% of half-column width and padding. */
const AFLOAT_GREEN_BADGE_W = "w-[90%] max-w-[90%] shrink-0";

const AFLOAT_GREEN_SLIDER =
  `relative ${AFLOAT_PRIMARY_BTN_H} ${AFLOAT_GREEN_BADGE_W} overflow-hidden rounded-xl px-3 py-2 shadow-md`;

/** Tally afloat (pre-tally) — amber; 90% of column width inside the shared right slot. */
const AFLOAT_AMBER_SLIDER =
  `box-border ml-auto block h-full w-[81.82%] max-w-[81.82%] overflow-hidden rounded-l-none rounded-r-xl px-3 py-2 text-lg font-semibold tracking-tight shadow-md bg-amber-400 text-splice-navy hover:bg-amber-300 dark:bg-amber-500 dark:hover:bg-amber-400`;

/** Blank + Undo outline (matches Undo Tally Afloat button). */
const AFLOAT_REAR_OUTLINE =
  "border-2 border-splice-navy-light bg-white shadow-sm dark:border-splice-sky dark:bg-splice-navy";

/** Blank left cell and Undo — same 110% of half-column width, extending into the center seam. */
const AFLOAT_REAR_BADGE_W = "w-[110%] max-w-[110%] shrink-0";

/** Right column forms share one right edge (110% wide, pinned to column right). */
const AFLOAT_RIGHT_FORM =
  `absolute right-0 top-0 box-border ${AFLOAT_PRIMARY_BTN_H} ${AFLOAT_REAR_BADGE_W}`;

/** Pill positions (Amend, Tallied list) match the 90% green footprint on blank and Tallied Afloat. */
const AFLOAT_LEFT_PILL_ANCHOR = `relative ${AFLOAT_PRIMARY_BTN_H} ${AFLOAT_GREEN_BADGE_W}`;

/** Green Tallied Afloat badge (left cell). */
const TICK_AFLOAT_PANEL =
  `${AFLOAT_GREEN_SLIDER} flex flex-col items-center justify-center gap-1 bg-emerald-600 dark:bg-emerald-700 sm:gap-1.5 sm:px-4 sm:py-2.5`;

/** Matches {@link HomeAmendRaceDetailsButton} `embedded` pill on green afloat badges */
const EMBEDDED_AFLOAT_PILL =
  "rounded-full border border-splice-water/80 bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-splice-navy shadow-sm backdrop-blur-sm dark:border-splice-sky/60 dark:bg-splice-navy/95 dark:text-splice-foam";

function TalliedAfloatListModal({
  fleetName,
  items,
  onClose,
}: {
  fleetName: string | null;
  items: HomeTalliedAfloatListItem[];
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const heading = fleetName?.trim()
    ? `Tallied afloat — ${fleetName.trim()}`
    : "Tallied afloat";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(24rem,85vh)] w-full max-w-md overflow-hidden rounded-xl border border-splice-sky bg-white shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
      >
        <div className="border-b border-splice-foam px-5 py-4 dark:border-splice-navy-light">
          <h3 id={titleId} className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
            {heading}
          </h3>
          <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">
            Boats tallied afloat in this fleet for this race.
          </p>
        </div>
        <ul className="max-h-64 overflow-y-auto px-5 py-3 text-sm">
          {items.length === 0 ? (
            <li className="py-4 text-center text-xs text-splice-ocean dark:text-splice-water">
              No boats tallied afloat in this fleet yet.
            </li>
          ) : (
            items.map((item, i) => (
              <li
                key={`${item.boatLabel}-${item.sailDisplay}-${i}`}
                className="border-b border-splice-foam py-2.5 last:border-none dark:border-splice-navy-light"
              >
                <p className="font-medium text-splice-navy dark:text-splice-surface">{item.boatLabel}</p>
                <p className="mt-0.5 text-xs text-splice-ocean dark:text-splice-water">
                  {item.helmDisplay !== "—" ? `${item.helmDisplay} · ` : null}
                  Sail {item.sailDisplay}
                  {item.talliedAtDisplay !== "—" ? (
                    <span className="tabular-nums"> · {item.talliedAtDisplay}</span>
                  ) : null}
                </p>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-splice-foam px-5 py-3 dark:border-splice-navy-light">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-splice-water px-4 py-2 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PursuitTallyListModal({
  slots,
  onClose,
}: {
  slots: PursuitTallySlotDisplay[];
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(28rem,85vh)] w-full max-w-md overflow-hidden rounded-xl border border-splice-sky bg-white shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
      >
        <div className="border-b border-splice-foam px-5 py-4 dark:border-splice-navy-light">
          <h3 id={titleId} className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
            Pursuit start sheet
          </h3>
        </div>
        <ul className="max-h-80 overflow-y-auto px-5 py-3 text-sm">
          {slots.map((slot, i) => (
            <li key={`${slot.startDisplay}-${i}`} className="border-b border-splice-foam py-3 last:border-none dark:border-splice-navy-light">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold tabular-nums text-splice-navy dark:text-splice-surface">
                  {slot.startDisplay}
                  <span className="ml-2 text-xs font-normal text-splice-ocean dark:text-splice-water">{slot.classLabels}</span>
                </p>
                {slot.isViewerSlot && slot.viewerTalliedAfloat ? (
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-emerald-600 shadow-sm"
                    title="You have tallied afloat"
                    aria-label="Tallied afloat"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden className="h-3.5 w-3.5">
                      <path d="M20 6 9 17l-5-5" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : null}
              </div>
              <p className="mt-2 font-mono text-xs tracking-wide text-splice-navy dark:text-splice-foam">
                {slot.sailCells.join("  ")}
              </p>
            </li>
          ))}
        </ul>
        <div className="border-t border-splice-foam px-5 py-3 dark:border-splice-navy-light">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-splice-water px-4 py-2 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TalliedListPill({
  fleetName,
  items,
  pursuitSlots,
}: {
  fleetName: string | null;
  items: HomeTalliedAfloatListItem[];
  pursuitSlots?: PursuitTallySlotDisplay[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={EMBEDDED_AFLOAT_PILL}>
        Tally List
      </button>
      {open && pursuitSlots?.length ? (
        <PursuitTallyListModal slots={pursuitSlots} onClose={() => setOpen(false)} />
      ) : open ? (
        <TalliedAfloatListModal fleetName={fleetName} items={items} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function CheckeredFinishFlagBox({ ashoreLoggedDisplay }: { ashoreLoggedDisplay?: string }) {
  const lightPattern = "repeating-conic-gradient(from 90deg, #fafafa 0% 25%, #18181b 0% 50%) 0 0 / 14px 14px";
  const darkPattern = "repeating-conic-gradient(from 90deg, #3f3f46 0% 25%, #18181b 0% 50%) 0 0 / 14px 14px";
  const timestamp = (
    <StatusTimestamp
      value={ashoreLoggedDisplay ?? ""}
      className="relative z-10 text-center text-[10px] font-medium tabular-nums leading-tight text-white drop-shadow-sm"
    />
  );

  return (
    <>
      <div
        className="dark:hidden relative flex min-h-[4.75rem] min-w-0 flex-col items-center justify-end overflow-hidden rounded-xl pb-1.5 shadow-sm ring-1 ring-inset ring-splice-water"
        style={{ background: lightPattern }}
        role="status"
        aria-label="Tallied ashore — finished"
      >
        {timestamp}
      </div>
      <div
        className="relative hidden min-h-[4.75rem] min-w-0 flex-col items-center justify-end overflow-hidden rounded-xl pb-1.5 shadow-sm ring-1 ring-inset ring-splice-ocean dark:flex"
        style={{ background: darkPattern }}
        role="status"
        aria-label="Tallied ashore — finished"
      >
        {timestamp}
      </div>
    </>
  );
}

function StatusTimestamp({ value, className }: { value: string; className?: string }) {
  if (!value || value === "—") return null;
  return (
    <span
      className={
        className ??
        "text-center text-[10px] font-medium tabular-nums leading-tight text-splice-blue dark:text-splice-water"
      }
    >
      {value}
    </span>
  );
}

function AbbrevDeclarationBox({
  primary,
  secondary,
  ashoreLoggedDisplay,
}: {
  primary: string;
  secondary: string;
  ashoreLoggedDisplay?: string;
}) {
  return (
    <div
      className="flex min-h-[4.75rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-splice-sky bg-splice-surface px-3 py-4 shadow-sm dark:border-splice-ocean dark:bg-splice-navy-light/80"
      role="status"
    >
      <span className="text-2xl font-bold tabular-nums tracking-tight text-splice-navy dark:text-splice-surface">{primary}</span>
      <span className="text-center text-[11px] font-medium uppercase tracking-wide text-splice-blue dark:text-splice-water">
        {secondary}
      </span>
      <StatusTimestamp value={ashoreLoggedDisplay ?? ""} />
    </div>
  );
}

function DeclarationStatusLeft({
  outcome,
  ashoreLoggedDisplay,
  outcomeSummaryDisplay,
}: {
  outcome: string;
  ashoreLoggedDisplay?: string;
  outcomeSummaryDisplay?: string;
}) {
  const o = outcome.trim().toLowerCase();
  if (o === "finished" || o === "") {
    return <CheckeredFinishFlagBox ashoreLoggedDisplay={ashoreLoggedDisplay} />;
  }
  if (o === "dns") {
    return <AbbrevDeclarationBox primary="DNS" secondary="Did not start" ashoreLoggedDisplay={ashoreLoggedDisplay} />;
  }
  if (o === "dnc") {
    return <AbbrevDeclarationBox primary="DNC" secondary="Did not compete" ashoreLoggedDisplay={ashoreLoggedDisplay} />;
  }
  if (o === "retired") {
    return <AbbrevDeclarationBox primary="RET" secondary="Retired" ashoreLoggedDisplay={ashoreLoggedDisplay} />;
  }
  if (o === "dnf") {
    return <AbbrevDeclarationBox primary="DNF" secondary="Did not finish" ashoreLoggedDisplay={ashoreLoggedDisplay} />;
  }
  if (o === "dsq") {
    return <AbbrevDeclarationBox primary="DSQ" secondary="Disqualified" ashoreLoggedDisplay={ashoreLoggedDisplay} />;
  }
  if (o === "ocs") {
    return <AbbrevDeclarationBox primary="OCS" secondary="On-course side" ashoreLoggedDisplay={ashoreLoggedDisplay} />;
  }
  return (
    <div
      className="flex min-h-[4.75rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-splice-water bg-splice-surface px-2 text-center dark:border-splice-ocean dark:bg-splice-navy"
      role="status"
    >
      <span className="text-xs font-medium text-splice-ocean dark:text-splice-water">Declaration recorded</span>
      {outcomeSummaryDisplay && outcomeSummaryDisplay !== "—" ? (
        <span className="text-[11px] font-semibold text-splice-navy dark:text-splice-foam">{outcomeSummaryDisplay}</span>
      ) : null}
      <StatusTimestamp value={ashoreLoggedDisplay ?? ""} />
    </div>
  );
}

function AshoreRecordedDeclarationRow({
  groupId,
  seriesId,
  raceId,
  boatId,
  outcomeCode,
  ashoreLoggedDisplay,
  outcomeSummaryDisplay,
  amendAllowed,
  amendDisabledLabel = "Tally closed",
}: {
  groupId: string;
  seriesId: string;
  raceId: string;
  boatId: string;
  outcomeCode: string;
  ashoreLoggedDisplay: string;
  outcomeSummaryDisplay: string;
  amendAllowed: boolean;
  amendDisabledLabel?: string;
}) {
  const initialForModal = outcomeCode.trim() || "finished";

  return (
    <div className="flex w-full min-w-0 gap-3">
      <div className="min-w-0 flex-1 basis-0">
        <DeclarationStatusLeft
          outcome={outcomeCode}
          ashoreLoggedDisplay={ashoreLoggedDisplay}
          outcomeSummaryDisplay={outcomeSummaryDisplay}
        />
      </div>
      <div className="min-w-0 flex-1 basis-0">
        {amendAllowed ? (
          <AshoreViaModalTrigger
            groupId={groupId}
            seriesId={seriesId}
            raceId={raceId}
            boatId={boatId}
            initialOutcome={initialForModal}
            lockedRoOutcome={
              isRoOnlyFinishOutcome(outcomeCode) ? outcomeCode.trim().toLowerCase() : null
            }
            triggerLabel="Amend Declaration"
            size="compact"
            modalAmend
          />
        ) : (
          <div
            className={`${AMEND_BTN} flex h-full min-h-[4.75rem] w-full cursor-not-allowed items-center justify-center border-2 border-splice-sky bg-splice-foam text-center text-sm font-semibold text-splice-water dark:border-splice-ocean dark:bg-splice-navy-light dark:text-splice-blue`}
            aria-disabled
          >
            {amendDisabledLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function WhiteTickIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="h-8 w-8 shrink-0 sm:h-9 sm:w-9"
    >
      <path
        d="M20 6 9 17l-5-5"
        stroke="white"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const AFLOAT_NEUTRAL_TRACK =
  `absolute left-0 top-0 ${AFLOAT_PRIMARY_BTN_H} ${AFLOAT_REAR_BADGE_W} rounded-l-xl rounded-r-none ${AFLOAT_REAR_OUTLINE}`;

/** Non-green right-hand slider action; inner edge square so it tucks under the left badge. */
const AFLOAT_RIGHT_REAR_ACTION =
  `rounded-l-none rounded-r-xl shadow-sm ${AFLOAT_PRIMARY_BTN_H}`;

/** Pills share the same corners on the blank left cell and on the Tallied Afloat badge. */
function AfloatLeftPillsOverlay({
  amendDetails,
  fleetName,
  talliedAfloatList,
  pursuitTallySlots,
}: {
  amendDetails: HomeBoatTallyPanelRow["amendDetails"];
  fleetName: string | null;
  talliedAfloatList: HomeTalliedAfloatListItem[];
  pursuitTallySlots?: PursuitTallySlotDisplay[];
}) {
  return (
    <>
      <div className="absolute left-1.5 top-1.5 z-10">
        <TalliedListPill fleetName={fleetName} items={talliedAfloatList} pursuitSlots={pursuitTallySlots} />
      </div>
      {amendDetails ? (
        <div className="absolute right-1.5 top-1.5 z-10">
          <HomeAmendRaceDetailsButton
            ctx={amendDetails.ctx}
            crewEditable={amendDetails.crewEditable}
            embedded
          />
        </div>
      ) : null}
    </>
  );
}

/** Left: blank / Tallied Afloat badge. Right: Tally afloat / Undo (slider across). */
function AfloatTallySliderRow({
  groupId,
  seriesId,
  raceId,
  boatId,
  afloatRecorded,
  afloatLoggedDisplay,
  amendDetails,
  fleetName,
  talliedAfloatList,
  pursuitTallySlots,
}: {
  groupId: string;
  seriesId: string;
  raceId: string;
  boatId: string;
  afloatRecorded: boolean;
  afloatLoggedDisplay: string;
  amendDetails: HomeBoatTallyPanelRow["amendDetails"];
  fleetName: string | null;
  talliedAfloatList: HomeTalliedAfloatListItem[];
  pursuitTallySlots?: PursuitTallySlotDisplay[];
}) {
  const leftOnTop = afloatRecorded;

  return (
    <div className="flex w-full min-w-0 items-stretch gap-0 overflow-visible">
      <div
        className={`relative -mr-6 min-w-0 flex-1 basis-0 shrink-0 ${leftOnTop ? "z-20" : "z-10"}`}
      >
        {afloatRecorded ? (
          <div className={`${TICK_AFLOAT_PANEL} mr-auto`} role="status" aria-label="Tallied afloat">
            <AfloatLeftPillsOverlay
              amendDetails={amendDetails}
              fleetName={fleetName}
              talliedAfloatList={talliedAfloatList}
              pursuitTallySlots={pursuitTallySlots}
            />
            <WhiteTickIcon />
            <span className="min-w-0 w-full text-balance text-center text-xs font-semibold leading-tight text-white sm:text-sm">
              Tallied Afloat
            </span>
            <StatusTimestamp
              value={afloatLoggedDisplay}
              className="text-center text-[10px] font-medium tabular-nums leading-tight text-white/90"
            />
          </div>
        ) : (
          <div className={`relative ${AFLOAT_PRIMARY_BTN_H} min-w-0 w-full`} aria-label="Tally afloat options">
            <div className={AFLOAT_NEUTRAL_TRACK} />
            <div className={`${AFLOAT_LEFT_PILL_ANCHOR} absolute left-0 top-0`}>
              <AfloatLeftPillsOverlay
                amendDetails={amendDetails}
                fleetName={fleetName}
                talliedAfloatList={talliedAfloatList}
              />
            </div>
          </div>
        )}
      </div>

      <div
        className={`relative -ml-6 min-w-0 flex-1 basis-0 shrink-0 ${AFLOAT_PRIMARY_BTN_H} ${leftOnTop ? "z-10" : "z-20"}`}
      >
        {afloatRecorded ? (
          <form action={undoTallyAfloatAction} className={AFLOAT_RIGHT_FORM}>
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="series_id" value={seriesId} />
            <input type="hidden" name="race_id" value={raceId} />
            <input type="hidden" name="boat_id" value={boatId} />
            <button
              type="submit"
              className={`${UNDO_BTN} ${AFLOAT_RIGHT_REAR_ACTION} ${AFLOAT_REAR_OUTLINE} box-border flex h-full w-full items-center justify-center pl-8 text-splice-navy hover:bg-splice-surface dark:text-splice-surface dark:hover:bg-splice-navy`}
            >
              Undo Tally Afloat
            </button>
          </form>
        ) : (
          <form action={tallyAfloatAction} className={AFLOAT_RIGHT_FORM}>
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="series_id" value={seriesId} />
            <input type="hidden" name="race_id" value={raceId} />
            <input type="hidden" name="boat_id" value={boatId} />
            <button
              type="submit"
              className={`${AFLOAT_AMBER_SLIDER} flex items-center justify-center`}
            >
              Tally afloat
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function AshoreViaModalTrigger({
  groupId,
  seriesId,
  raceId,
  boatId,
  initialOutcome,
  triggerLabel = "Tally Ashore & Declaration",
  size = "large",
  modalAmend = false,
  lockedRoOutcome = null,
}: {
  groupId: string;
  seriesId: string;
  raceId: string;
  boatId: string;
  initialOutcome: string;
  triggerLabel?: string;
  size?: "large" | "compact";
  modalAmend?: boolean;
  lockedRoOutcome?: string | null;
}) {
  const [open, setOpen] = useState(false);

  const triggerCls =
    size === "large"
      ? `${BIG_BTN} w-full border-2 border-splice-navy-light bg-white text-splice-navy hover:bg-splice-surface dark:border-splice-sky dark:bg-splice-navy dark:text-splice-surface dark:hover:bg-splice-navy-light`
      : `${AMEND_BTN} flex h-full min-h-[4.75rem] w-full items-center justify-center border-2 border-splice-navy-light bg-white text-splice-navy hover:bg-splice-surface dark:border-splice-sky dark:bg-splice-navy dark:text-splice-surface dark:hover:bg-splice-navy`;

  return (
    <>
      <button type="button" className={triggerCls} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open ? (
        <AshoreDeclarationModal
          key={`${raceId}-${boatId}-${initialOutcome}-${modalAmend ? "amend" : "new"}-${lockedRoOutcome ?? ""}`}
          groupId={groupId}
          seriesId={seriesId}
          raceId={raceId}
          boatId={boatId}
          initialOutcome={initialOutcome}
          amend={modalAmend}
          lockedRoOutcome={lockedRoOutcome}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}


function BoatTallyForms({
  groupId,
  seriesId,
  raceId,
  scheduledAtIso,
  nowMs,
  boatRows,
}: {
  groupId: string;
  seriesId: string;
  raceId: string;
  scheduledAtIso: string;
  nowMs: number;
  boatRows: HomeBoatTallyPanelRow[];
}) {
  return (
    <>
      <div className="mt-4 flex flex-col gap-6">
        {boatRows.length === 0 ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            No boats on your series signup — add them under the club&apos;s Series list, then reload Home.
          </p>
        ) : (
          boatRows.map((row) => {
            const fleetStartMs = fleetStartUtcMs(scheduledAtIso, row.fleetOffsetMinutes);
            const ashoreGateOpen = nowMs >= fleetStartMs;
            const afloatRecorded = !!row.tally_afloat_at;
            const ashoreRecorded = !!row.tally_ashore_at;
            const declarationOutcome = row.outcome ?? "";
            const initialForModal = declarationOutcome.trim() || "finished";
            const lockedRoOutcome = isRoOnlyFinishOutcome(declarationOutcome)
              ? declarationOutcome.trim().toLowerCase()
              : null;
            const roOutcomeLocked = lockedRoOutcome != null;

            return (
              <div
                key={row.boatId}
                className="rounded-xl border border-splice-sky bg-splice-surface/50 p-3 dark:border-splice-ocean dark:bg-splice-navy/50"
              >
                <BoatTallyHeaderRow row={row} />
                <BoatTallyActions
                  amendDetails={row.amendDetails}
                  showAmendOverlay={ashoreGateOpen}
                >
                  <div className="flex flex-col gap-4">
                    {!ashoreGateOpen ? (
                      <AfloatTallySliderRow
                        groupId={groupId}
                        seriesId={seriesId}
                        raceId={raceId}
                        boatId={row.boatId}
                        afloatRecorded={afloatRecorded}
                        afloatLoggedDisplay={row.afloatLoggedDisplay}
                        amendDetails={row.amendDetails}
                        fleetName={row.fleetName}
                        talliedAfloatList={row.talliedAfloatList}
                        pursuitTallySlots={row.pursuitTallySlots}
                      />
                    ) : null}

                    {ashoreGateOpen ? (
                      ashoreRecorded ? (
                        <AshoreRecordedDeclarationRow
                          groupId={groupId}
                          seriesId={seriesId}
                          raceId={raceId}
                          boatId={row.boatId}
                          outcomeCode={declarationOutcome}
                          ashoreLoggedDisplay={row.ashoreLoggedDisplay}
                          outcomeSummaryDisplay={row.outcomeSummaryDisplay}
                          amendAllowed={!roOutcomeLocked}
                          amendDisabledLabel="Finish status recorded by the race officer"
                        />
                      ) : (
                        <AshoreViaModalTrigger
                          groupId={groupId}
                          seriesId={seriesId}
                          raceId={raceId}
                          boatId={row.boatId}
                          initialOutcome={initialForModal}
                          lockedRoOutcome={lockedRoOutcome}
                          triggerLabel={
                            roOutcomeLocked && lockedRoOutcome
                              ? `Tally ashore & confirm ${lockedRoOutcome.toUpperCase()}`
                              : "Tally Ashore & Declaration"
                          }
                        />
                      )
                    ) : null}
                  </div>
                </BoatTallyActions>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

const DECLARATION_BASE = ["finished", "retired", "dns"] as const;

function normalizeDeclarationInitial(initialOutcome: string): string {
  const rawTrim = initialOutcome.trim().toLowerCase();
  if (isRoOnlyFinishOutcome(rawTrim)) {
    return rawTrim;
  }
  const raw = initialOutcome.trim() || "finished";
  return (DECLARATION_BASE as readonly string[]).includes(raw) ? raw : "finished";
}

function AshoreDeclarationModal({
  groupId,
  seriesId,
  raceId,
  boatId,
  initialOutcome,
  amend = false,
  lockedRoOutcome = null,
  onClose,
}: {
  groupId: string;
  seriesId: string;
  raceId: string;
  boatId: string;
  initialOutcome: string;
  amend?: boolean;
  lockedRoOutcome?: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const roOutcomeLocked = lockedRoOutcome != null;

  const [outcome, setOutcome] = useState(() => normalizeDeclarationInitial(initialOutcome));

  useEffect(() => {
    if (lockedRoOutcome) {
      setOutcome(lockedRoOutcome);
    }
  }, [lockedRoOutcome]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-splice-sky bg-white p-5 shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
      >
        <h3 id={titleId} className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
          {roOutcomeLocked && lockedRoOutcome
            ? amend
              ? "Amend declaration"
              : `Tally ashore — confirm ${lockedRoOutcome.toUpperCase()}`
            : amend
              ? "Amend declaration"
              : "Tally ashore & declaration"}
        </h3>
        <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
          {roOutcomeLocked && lockedRoOutcome ? (
            <>
              The race officer recorded{" "}
              <strong className="text-splice-ocean dark:text-splice-water">
                {lockedRoOutcome.toUpperCase()}
              </strong>{" "}
              for this entry. Record ashore to confirm; you cannot choose a different declaration here.
            </>
          ) : amend ? (
            "Update your sailing declaration anytime after fleet start."
          ) : (
            "Confirm your sailing declaration from fleet start onward. You can revisit and amend anytime after that."
          )}
        </p>
        <form action={tallyAshoreAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="series_id" value={seriesId} />
          <input type="hidden" name="race_id" value={raceId} />
          <input type="hidden" name="boat_id" value={boatId} />
          <input type="hidden" name="outcome" value={outcome} />
          {roOutcomeLocked && lockedRoOutcome ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              Declaration:{" "}
              <span className="font-semibold">{roOnlyFinishOutcomeLabel(lockedRoOutcome)}</span>
            </p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-medium text-splice-ocean dark:text-splice-water">Declaration</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
                <input type="radio" checked={outcome === "finished"} onChange={() => setOutcome("finished")} /> Finished
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
                <input type="radio" checked={outcome === "retired"} onChange={() => setOutcome("retired")} /> Retired
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
                <input type="radio" checked={outcome === "dns"} onChange={() => setOutcome("dns")} /> Did not start (DNS)
              </label>
            </fieldset>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-splice-water px-4 py-2 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-splice-navy px-4 py-2 text-xs font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
            >
              {roOutcomeLocked && !amend
                ? "Record tally ashore"
                : amend
                  ? "Save declaration"
                  : "Record tally ashore & declaration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



export function HomeNextRaceTallyPanel(props: {
  groupId: string;
  seriesId: string;
  raceId: string;
  scheduledAtIso: string;
  nowMs: number;
  boatRows: HomeBoatTallyPanelRow[];
}) {
  const { groupId, seriesId, raceId, scheduledAtIso, nowMs, boatRows } = props;

  return (
    <div className="mt-4 min-w-0 max-w-full">
      <BoatTallyForms
          groupId={groupId}
          seriesId={seriesId}
          raceId={raceId}
          scheduledAtIso={scheduledAtIso}
          nowMs={nowMs}
          boatRows={boatRows}
        />
    </div>
  );
}
