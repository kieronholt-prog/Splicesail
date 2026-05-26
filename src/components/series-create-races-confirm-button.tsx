"use client";

import { useState, useTransition } from "react";

import {
  generateSeriesRacesAction,
  previewGenerateSeriesRacesAction,
  type PreviewGenerateSeriesRacesResult,
  type RaceGenerationIntent,
} from "@/app/actions/series-schedule";

type Props = {
  formId: string;
};

function raceWord(n: number) {
  return n === 1 ? "race" : "races";
}

export function SeriesCreateRacesConfirmButton({ formId }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIntent, setActiveIntent] = useState<RaceGenerationIntent | null>(null);
  const [preview, setPreview] = useState<Extract<PreviewGenerateSeriesRacesResult, { ok: true }> | null>(
    null,
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [submitPending, startSubmit] = useTransition();

  function close() {
    setOpen(false);
    setPreview(null);
    setFetchError(null);
    setActiveIntent(null);
  }

  function handleOpenClick(intent: RaceGenerationIntent) {
    setFetchError(null);
    setPreview(null);
    setActiveIntent(intent);
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) {
      setFetchError("Could not read the generator form.");
      setOpen(true);
      return;
    }
    const fd = new FormData(form);
    fd.set("race_generation_intent", intent);
    startPreview(async () => {
      const res = await previewGenerateSeriesRacesAction(fd);
      if (!res.ok) {
        setFetchError(res.error);
        setOpen(true);
        return;
      }
      setPreview(res);
      setOpen(true);
    });
  }

  function handleConfirm() {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const intent = activeIntent;
    if (!form || !intent) return;
    const fd = new FormData(form);
    fd.set("race_generation_intent", intent);
    startSubmit(async () => {
      await generateSeriesRacesAction(fd);
    });
  }

  const busy = previewPending || submitPending;

  const dialogTitle = fetchError
    ? "Cannot apply races"
    : preview?.intent === "add_races"
      ? "Confirm add races"
      : "Confirm create / replan all";

  const confirmLabel =
    preview?.intent === "add_races"
      ? submitPending
        ? "Adding…"
        : "Add races"
      : submitPending
        ? "Applying…"
        : "Create / replan all";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleOpenClick("replan_all")}
          disabled={busy}
          className="rounded-lg border border-splice-water px-3 py-2 text-sm font-medium text-splice-navy disabled:opacity-60 dark:border-splice-ocean dark:text-splice-foam"
        >
          {previewPending && activeIntent === "replan_all"
            ? "Preparing…"
            : submitPending && activeIntent === "replan_all"
              ? "Applying…"
              : "Create / replan all"}
        </button>
        <button
          type="button"
          onClick={() => handleOpenClick("add_races")}
          disabled={busy}
          className="rounded-lg border border-splice-water px-3 py-2 text-sm font-medium text-splice-navy disabled:opacity-60 dark:border-splice-ocean dark:text-splice-foam"
        >
          {previewPending && activeIntent === "add_races"
            ? "Preparing…"
            : submitPending && activeIntent === "add_races"
              ? "Adding…"
              : "Add races"}
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-xl border border-splice-sky bg-white p-6 shadow-lg dark:border-splice-ocean dark:bg-splice-navy"
            role="dialog"
            aria-modal="true"
            aria-labelledby="race-gen-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="race-gen-confirm-title"
              className="text-lg font-semibold text-splice-navy dark:text-splice-surface"
            >
              {dialogTitle}
            </h3>

            {fetchError ? (
              <p className="mt-3 text-sm text-splice-ocean dark:text-splice-water" role="alert">
                {fetchError}
              </p>
            ) : preview ? (
              <div className="mt-3 space-y-3 text-sm text-splice-ocean dark:text-splice-water">
                <p>
                  Uses your <strong className="text-splice-navy-light dark:text-splice-sky">saved</strong> generator template
                  (click Save generator first if you changed dates, times, races on day, or periodicity).
                </p>

                {preview.mode === "single_day" && preview.plannedSlotCount > 1 ? (
                  <p className="rounded-lg bg-splice-foam px-3 py-2 text-splice-navy-light dark:bg-splice-navy-light dark:text-splice-sky">
                    This template schedules{" "}
                    <strong className="tabular-nums">{preview.plannedSlotCount}</strong>{" "}
                    {raceWord(preview.plannedSlotCount)} on the season start date (from races on day and minutes
                    between).
                  </p>
                ) : null}

                {preview.intent === "replan_all" ? (
                  <p>
                    <strong className="text-splice-navy-light dark:text-splice-sky">Create / replan all</strong>{" "}
                    syncs the template to unpublished races: matching slots reuse existing rows by sequence (Race 1
                    stays Race 1 even when times shift), extras are removed, and missing slots are added. Races with
                    recorded finish times keep their start time. Results-final races stay unchanged.
                  </p>
                ) : (
                  <p>
                    <strong className="text-splice-navy-light dark:text-splice-sky">Add races</strong> keeps every existing race and
                    only inserts starts that are not already on the calendar (within about a minute).
                  </p>
                )}

                {preview.intent === "replan_all" ? (
                  <ul className="list-inside list-disc space-y-1.5 tabular-nums">
                    {preview.startTimeLockedCount > 0 ? (
                      <li>
                        <strong className="text-splice-navy-light dark:text-splice-sky">{preview.startTimeLockedCount}</strong>{" "}
                        {raceWord(preview.startTimeLockedCount)} with recorded finish times will keep their current start
                        time
                      </li>
                    ) : null}
                    {preview.racesReused > 0 ? (
                      <li>
                        <strong className="text-splice-navy-light dark:text-splice-sky">{preview.racesReused}</strong>{" "}
                        unpublished {raceWord(preview.racesReused)} will be reused (same row, updated if needed)
                      </li>
                    ) : null}
                    {preview.unpublishedRemoved > 0 ? (
                      <li>
                        <strong className="text-splice-navy-light dark:text-splice-sky">{preview.unpublishedRemoved}</strong>{" "}
                        unpublished {raceWord(preview.unpublishedRemoved)} will be removed
                      </li>
                    ) : null}
                    <li>
                      <strong className="text-splice-navy-light dark:text-splice-sky">{preview.finalKept}</strong> results-final{" "}
                      {raceWord(preview.finalKept)} will stay unchanged
                    </li>
                    {preview.racesToCreate > 0 ? (
                      <li>
                        <strong className="text-splice-navy-light dark:text-splice-sky">{preview.racesToCreate}</strong> new{" "}
                        {raceWord(preview.racesToCreate)} will be created from the template
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <ul className="list-inside list-disc space-y-1.5 tabular-nums">
                    <li>
                      <strong className="text-splice-navy-light dark:text-splice-sky">{preview.racesToCreate}</strong> new{" "}
                      {raceWord(preview.racesToCreate)} will be added (missing start times only)
                    </li>
                    {preview.skippedDuplicateSlots > 0 ? (
                      <li>
                        <strong className="text-splice-navy-light dark:text-splice-sky">{preview.skippedDuplicateSlots}</strong>{" "}
                        planned slot{preview.skippedDuplicateSlots === 1 ? "" : "s"} already exist — skipped
                      </li>
                    ) : null}
                    <li>No races are removed; existing unpublished and results-final races all stay.</li>
                  </ul>
                )}

                {preview.intent === "replan_all" ? (
                  <p className="text-splice-ocean dark:text-splice-water">
                    Afterward this series will have{" "}
                    <strong className="tabular-nums text-splice-navy dark:text-splice-surface">
                      {preview.finalKept + preview.racesReused + preview.racesToCreate}
                    </strong>{" "}
                    {raceWord(preview.finalKept + preview.racesReused + preview.racesToCreate)} in total.
                  </p>
                ) : (
                  <p className="text-splice-ocean dark:text-splice-water">
                    Afterward this series will have{" "}
                    <strong className="tabular-nums text-splice-navy dark:text-splice-surface">
                      {preview.finalKept + preview.unpublishedNotFinalCount + preview.racesToCreate}
                    </strong>{" "}
                    {raceWord(
                      preview.finalKept + preview.unpublishedNotFinalCount + preview.racesToCreate,
                    )}{" "}
                    in total.
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={close}
                disabled={submitPending}
                className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium text-splice-navy disabled:opacity-60 dark:border-splice-ocean dark:text-splice-foam"
              >
                {fetchError ? "Close" : "Cancel"}
              </button>
              {!fetchError && preview ? (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitPending}
                  className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-splice-foam dark:text-splice-navy"
                >
                  {confirmLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
