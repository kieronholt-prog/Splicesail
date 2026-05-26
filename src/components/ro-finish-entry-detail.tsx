import { EntryTallyStartedChips } from "@/components/entry-tally-started-chips";
import { formatClubDateTimeMediumShort } from "@/lib/club-display-format";
import { finishStatusDisplay } from "@/lib/finish-outcome-labels";

export function RoFinishEntryDetail({
  clubTz,
  fleetStartAtIso,
  startedMarkedAt,
  tallyAfloatAt,
  tallyAshoreAt,
  finishAt,
  finishPosition,
  outcome,
  isGuest,
  positionalScoring = false,
}: {
  clubTz: string;
  fleetStartAtIso: string | null;
  startedMarkedAt: string | null;
  tallyAfloatAt: string | null;
  tallyAshoreAt: string | null;
  finishAt: string | null;
  finishPosition?: number | null;
  outcome: string | null;
  isGuest?: boolean;
  positionalScoring?: boolean;
}) {
  const finishLabel = positionalScoring
    ? finishPosition != null && finishPosition >= 1
      ? String(finishPosition)
      : finishStatusDisplay(outcome)
    : finishAt
      ? formatClubDateTimeMediumShort(finishAt, clubTz)
      : finishStatusDisplay(outcome);

  return (
    <section
      className="space-y-3 rounded-lg border border-splice-foam bg-splice-surface/80 px-3 py-3 dark:border-splice-navy-light dark:bg-splice-navy/50"
      aria-label="Entry detail"
    >
      {!isGuest ? (
        <EntryTallyStartedChips
          tallyAfloatAt={tallyAfloatAt}
          tallyAshoreAt={tallyAshoreAt}
          startedMarkedAt={startedMarkedAt}
        />
      ) : null}
      <dl className="grid gap-2 text-xs text-splice-ocean dark:text-splice-water sm:grid-cols-2">
        <div>
          <dt className="font-medium text-splice-blue dark:text-splice-water">Fleet start</dt>
          <dd>{formatClubDateTimeMediumShort(fleetStartAtIso, clubTz)}</dd>
        </div>
        <div>
          <dt className="font-medium text-splice-blue dark:text-splice-water">Seen on line</dt>
          <dd>{formatClubDateTimeMediumShort(startedMarkedAt, clubTz)}</dd>
        </div>
        {!isGuest ? (
          <>
            <div>
              <dt className="font-medium text-splice-blue dark:text-splice-water">Tally afloat</dt>
              <dd>{formatClubDateTimeMediumShort(tallyAfloatAt, clubTz)}</dd>
            </div>
            <div>
              <dt className="font-medium text-splice-blue dark:text-splice-water">Tally ashore</dt>
              <dd>{formatClubDateTimeMediumShort(tallyAshoreAt, clubTz)}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt className="font-medium text-splice-blue dark:text-splice-water">
            {positionalScoring ? "Finish position" : "Finish"}
          </dt>
          <dd>{finishLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
