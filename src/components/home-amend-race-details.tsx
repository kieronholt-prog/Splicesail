"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  updateRaceEntryCrewOverrideForHomeAction,
  updateRaceEntrySailNumberForHomeAction,
} from "@/app/actions/race-entries";
import { BoatCrewFields } from "@/components/boat-crew-fields";

export type Handedness = "single" | "double" | "triple_plus";

export type HomeAmendRaceTarget = {
  groupId: string;
  seriesId: string;
  raceId: string;
  raceTitle: string;
  raceEntryId: string;
  handedness: Handedness;
  sailNumberOverride: string;
  hasCrewOverride: boolean;
  helmUseOwner: boolean;
  helmName: string;
  helmPhone: string;
  c1UseOwner: boolean;
  c1Name: string;
  c1Phone: string;
  c2UseOwner: boolean;
  c2Name: string;
  c2Phone: string;
};

export function HomeAmendRaceDetailsButton({
  ctx,
  crewEditable,
  embedded = false,
}: {
  ctx: HomeAmendRaceTarget;
  crewEditable: boolean;
  /** Compact pill for tally control top-right overlay */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          embedded
            ? "rounded-full border border-splice-water/80 bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-splice-navy shadow-sm backdrop-blur-sm dark:border-splice-sky/60 dark:bg-splice-navy/95 dark:text-splice-foam"
            : "rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
        }
      >
        {embedded ? "Details" : "Amend details"}
      </button>
      {open ? (
        <HomeAmendRaceDetailsOverlay
          ctx={ctx}
          crewEditable={crewEditable}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function HomeAmendRaceDetailsOverlay({
  ctx,
  crewEditable,
  onClose,
}: {
  ctx: HomeAmendRaceTarget;
  crewEditable: boolean;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      ref={backdropRef}
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-splice-sky bg-white p-5 shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={headingId} className="text-sm font-semibold text-splice-navy dark:text-splice-surface">
            Amend race details — {ctx.raceTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-splice-ocean hover:bg-splice-foam dark:text-splice-water dark:hover:bg-splice-navy-light"
          >
            Close
          </button>
        </div>

        <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">
          Changes apply only to this race entry (display and race-day lists). Updating your boat under My boats is
          separate.
        </p>

        <section className="mt-6 border-t border-splice-foam pt-5 dark:border-splice-navy-light">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
            Sail number
          </h3>
          <form action={updateRaceEntrySailNumberForHomeAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="group_id" value={ctx.groupId} />
            <input type="hidden" name="series_id" value={ctx.seriesId} />
            <input type="hidden" name="race_id" value={ctx.raceId} />
            <input type="hidden" name="race_entry_id" value={ctx.raceEntryId} />
            <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
              Override for this race only{" "}
              <span className="font-normal text-splice-blue">(leave blank for boat default)</span>
              <input
                name="sail_number_override"
                defaultValue={ctx.sailNumberOverride}
                placeholder="Sail number"
                className="rounded-lg border border-splice-water bg-white px-3 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-splice-navy px-3 py-2 text-xs font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
            >
              Save sail number
            </button>
          </form>
        </section>

        <section className="mt-8 border-t border-splice-foam pt-5 dark:border-splice-navy-light">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
            Crew details
          </h3>

          {!crewEditable ? (
            <p className="mt-3 text-sm text-amber-900 dark:text-amber-100">
              This entry has no boat yet — set your boats on your series registration, then reopen this race entry.
            </p>
          ) : (
            <>
              {ctx.hasCrewOverride ? (
                <form action={updateRaceEntryCrewOverrideForHomeAction} className="mt-2">
                  <input type="hidden" name="group_id" value={ctx.groupId} />
                  <input type="hidden" name="series_id" value={ctx.seriesId} />
                  <input type="hidden" name="race_id" value={ctx.raceId} />
                  <input type="hidden" name="race_entry_id" value={ctx.raceEntryId} />
                  <input type="hidden" name="clear_crew_override" value="1" />
                  <button
                    type="submit"
                    className="text-xs font-medium text-splice-blue underline dark:text-splice-water"
                  >
                    Reset crew — use boat defaults instead
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-xs text-splice-blue dark:text-splice-water">Using boat helm/crew defaults.</p>
              )}

              <form action={updateRaceEntryCrewOverrideForHomeAction} className="mt-5 flex flex-col gap-6">
                <input type="hidden" name="group_id" value={ctx.groupId} />
                <input type="hidden" name="series_id" value={ctx.seriesId} />
                <input type="hidden" name="race_id" value={ctx.raceId} />
                <input type="hidden" name="race_entry_id" value={ctx.raceEntryId} />
                <BoatCrewFields
                  handednessLocked
                  lockedHandedness={ctx.handedness}
                  defaultHandedness={ctx.handedness}
                  helmUseOwner={ctx.helmUseOwner}
                  helmName={ctx.helmName}
                  helmPhone={ctx.helmPhone}
                  c1UseOwner={ctx.c1UseOwner}
                  c1Name={ctx.c1Name}
                  c1Phone={ctx.c1Phone}
                  c2UseOwner={ctx.c2UseOwner}
                  c2Name={ctx.c2Name}
                  c2Phone={ctx.c2Phone}
                />
                <button
                  type="submit"
                  className="rounded-lg bg-splice-navy px-3 py-2 text-xs font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                >
                  Save crew overrides for this race
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}
