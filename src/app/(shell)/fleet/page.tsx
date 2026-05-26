import Link from "next/link";
import { redirect } from "next/navigation";
import { FleetBoatRowActions } from "@/components/fleet-boat-row-actions";
import { FleetUndoRetireBoatForm } from "@/components/fleet-undo-retire-boat-form";
import { helmAndCrewDisplayLabels } from "@/lib/boat-crew";
import { formatBoatDateDdMonYy } from "@/lib/format-boat-list-date";
import { isBoatActiveInFleet } from "@/lib/boat-validity";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { truncateToLastCharEllipsis } from "@/lib/truncate-display";

/** Matches `w-[15ch]` columns — ellipsis uses only one character at the end. */
const FLEET_SAIL_TYPE_MAX_CHARS = 15;
/** Approx. one line in the flexible Helm/crew column. */
const FLEET_HELM_CREW_LINE_MAX_CHARS = 48;

function fleetHelmCrewRow(role: "Helm" | "Crew", value: string) {
  const prefix = `${role} `;
  const full = `${role} ${value}`;
  const maxValueChars = Math.max(1, FLEET_HELM_CREW_LINE_MAX_CHARS - prefix.length);
  const valueShown =
    full.length <= FLEET_HELM_CREW_LINE_MAX_CHARS
      ? value
      : truncateToLastCharEllipsis(value, maxValueChars);
  return { full, valueShown };
}

function FleetHelmCrewCell({
  handedness,
  crewTemplate,
  ownerDisplayName,
}: {
  handedness: string;
  crewTemplate: unknown;
  ownerDisplayName: string | null;
}) {
  const { helm, crew } = helmAndCrewDisplayLabels(crewTemplate, handedness, ownerDisplayName);
  const helmRow = fleetHelmCrewRow("Helm", helm);
  const crewRow = fleetHelmCrewRow("Crew", crew);
  const isSingleHanded = handedness === "single";

  return (
    <div className="flex flex-col gap-0.5 text-[0.7rem] leading-snug text-splice-ocean sm:text-xs dark:text-splice-water">
      <span className="block overflow-hidden whitespace-nowrap" title={helmRow.full}>
        <span className="font-medium text-splice-ocean dark:text-splice-water">Helm</span> {helmRow.valueShown}
      </span>
      {!isSingleHanded ? (
        <span className="block overflow-hidden whitespace-nowrap" title={crewRow.full}>
          <span className="font-medium text-splice-ocean dark:text-splice-water">Crew</span> {crewRow.valueShown}
        </span>
      ) : null}
    </div>
  );
}

type Props = {
  searchParams: Promise<{ error?: string; boat_removed?: string; boat_restored?: string }>;
};

type BoatRow = {
  id: string;
  label: string | null;
  class_name: string | null;
  default_sail_number: string | null;
  handedness: string;
  crew_template: unknown;
  valid_to: string | null;
  created_at: string;
};

export default async function FleetPage({ searchParams }: Props) {
  const q = await searchParams;
  const err = q.error ? decodeURIComponent(q.error) : null;
  const boatRemoved = q.boat_removed === "soft" || q.boat_removed === "hard" ? q.boat_removed : null;
  const boatRestored = q.boat_restored === "1";

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const [{ data: allRows, error }, { data: profileRow }] = await Promise.all([
    supabase
      .from("boats")
      .select("id, label, class_name, default_sail_number, handedness, crew_template, valid_to, created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  const ownerDisplayName = profileRow?.display_name ?? null;

  const list = (allRows ?? []) as BoatRow[];
  const at = new Date();
  const boats = list.filter((r) => isBoatActiveInFleet(r.valid_to, at));
  const retiredBoats = list
    .filter((r) => !isBoatActiveInFleet(r.valid_to, at))
    .slice()
    .sort((a, b) => {
      const tb = new Date(b.valid_to ?? 0).getTime();
      const ta = new Date(a.valid_to ?? 0).getTime();
      return tb - ta;
    });

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">My boats</h1>
            <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">
              Boats you sail — used when you enter club races (helm/crew template per boat).
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href="/groups"
              className="inline-flex justify-center rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy hover:bg-splice-surface dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            >
              Enter series
            </Link>
            <Link
              href="/fleet/new"
              className="inline-flex justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
            >
              Add boat
            </Link>
          </div>
        </div>

        {err ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {err}
          </p>
        ) : null}

        {boatRestored ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Hull returned to your active fleet — you can attach it to series again.
          </p>
        ) : null}

        {boatRemoved === "soft" ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Boat retired from your fleet — open <strong className="font-semibold">Retired hulls</strong> below to undo.
            Past race results are unchanged.
          </p>
        ) : null}
        {boatRemoved === "hard" ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Boat removed and deleted — series links for that hull were cleared.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            {error.message}
          </p>
        ) : null}

        {!boats.length && !retiredBoats.length ? (
          <div className="mt-8 rounded-xl border border-splice-sky bg-white px-4 py-10 text-center text-sm text-splice-ocean dark:border-splice-navy-light dark:bg-splice-navy dark:text-splice-water">
            No boats yet.{" "}
            <Link href="/fleet/new" className="font-medium text-splice-blue dark:text-splice-water">
              Add your first boat
            </Link>
            .
          </div>
        ) : null}

        {boats.length > 0 ? (
          <div className="mt-8 overflow-hidden rounded-xl border border-splice-sky bg-white dark:border-splice-navy-light dark:bg-splice-navy">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                <tr>
                  <th className="w-[15ch] max-w-[15ch] truncate px-2 py-2.5 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                    Sail
                  </th>
                  <th className="w-[15ch] max-w-[15ch] truncate px-2 py-2.5 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                    Type
                  </th>
                  <th className="w-[15ch] max-w-[15ch] truncate px-2 py-2.5 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                    Name
                  </th>
                  <th className="min-w-0 px-2 py-2.5 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                    Helm / crew
                  </th>
                  <th className="min-w-[12.75rem] whitespace-nowrap py-2.5 pl-2 pr-4 text-right text-xs font-medium sm:min-w-[13.25rem] sm:pl-3 sm:pr-5 sm:text-sm">
                    <span className="sr-only">Row actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                {boats.map((b) => {
                  const sail = b.default_sail_number?.trim() ? b.default_sail_number : "—";
                  const boatType = b.class_name?.trim() ? b.class_name : "—";
                  const boatName = b.label?.trim() ? b.label : "—";
                  return (
                    <tr key={b.id}>
                      <td
                        className="max-w-[15ch] whitespace-nowrap px-2 py-2.5 tabular-nums text-splice-navy-light sm:px-3 dark:text-splice-sky"
                        title={sail}
                      >
                        {truncateToLastCharEllipsis(sail, FLEET_SAIL_TYPE_MAX_CHARS)}
                      </td>
                      <td
                        className="max-w-[15ch] whitespace-nowrap px-2 py-2.5 text-splice-navy-light sm:px-3 dark:text-splice-sky"
                        title={boatType}
                      >
                        {truncateToLastCharEllipsis(boatType, FLEET_SAIL_TYPE_MAX_CHARS)}
                      </td>
                      <td
                        className="max-w-[15ch] whitespace-nowrap px-2 py-2.5 text-splice-navy-light sm:px-3 dark:text-splice-sky"
                        title={boatName}
                      >
                        {truncateToLastCharEllipsis(boatName, FLEET_SAIL_TYPE_MAX_CHARS)}
                      </td>
                      <td className="min-w-0 px-2 py-2.5 sm:px-3">
                        <FleetHelmCrewCell
                          handedness={b.handedness}
                          crewTemplate={b.crew_template}
                          ownerDisplayName={ownerDisplayName}
                        />
                      </td>
                      <td className="min-w-[12.75rem] whitespace-nowrap py-2.5 pl-2 pr-4 text-right align-middle sm:min-w-[13.25rem] sm:pl-3 sm:pr-5">
                        <FleetBoatRowActions boatId={b.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {retiredBoats.length > 0 ? (
          <details className="mt-8 rounded-xl border border-splice-water bg-splice-foam/80 p-4 dark:border-splice-ocean dark:bg-splice-navy/80">
            <summary className="cursor-pointer list-none text-sm font-semibold text-splice-navy dark:text-splice-surface [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden>▸</span>
                Retired hulls (removed but kept for past results) — {retiredBoats.length}
              </span>
            </summary>
            <p className="mt-3 text-xs text-splice-ocean dark:text-splice-water">
              These dinghies no longer appear for new series entries. Use <strong className="text-splice-navy-light dark:text-splice-sky">Undo Remove</strong>{" "}
              to make one active again.
            </p>
            <div className="mt-4 overflow-hidden rounded-lg border border-splice-sky bg-white dark:border-splice-ocean dark:bg-splice-navy">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                  <tr>
                    <th className="w-[15ch] max-w-[15ch] truncate px-2 py-2 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                      Sail
                    </th>
                    <th className="w-[15ch] max-w-[15ch] truncate px-2 py-2 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                      Type
                    </th>
                    <th className="w-[15ch] max-w-[15ch] truncate px-2 py-2 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                      Name
                    </th>
                    <th className="min-w-0 px-2 py-2 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                      Helm / crew
                    </th>
                    <th className="min-w-0 px-2 py-2 text-xs font-medium text-splice-ocean sm:px-3 sm:text-sm dark:text-splice-water">
                      Removed
                    </th>
                    <th className="min-w-[10.5rem] whitespace-nowrap py-2 pl-2 pr-4 text-right text-xs font-medium sm:min-w-[11rem] sm:pl-3 sm:pr-5 sm:text-sm">
                      <span className="sr-only">Row actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                  {retiredBoats.map((b) => {
                    const sail = b.default_sail_number?.trim() ? b.default_sail_number : "—";
                    const boatType = b.class_name?.trim() ? b.class_name : "—";
                    const boatName = b.label?.trim() ? b.label : "—";
                    return (
                      <tr key={b.id} className="text-splice-navy-light dark:text-splice-sky">
                        <td className="max-w-[15ch] whitespace-nowrap px-2 py-2 tabular-nums sm:px-3" title={sail}>
                          {truncateToLastCharEllipsis(sail, FLEET_SAIL_TYPE_MAX_CHARS)}
                        </td>
                        <td className="max-w-[15ch] whitespace-nowrap px-2 py-2 sm:px-3" title={boatType}>
                          {truncateToLastCharEllipsis(boatType, FLEET_SAIL_TYPE_MAX_CHARS)}
                        </td>
                        <td className="max-w-[15ch] whitespace-nowrap px-2 py-2 sm:px-3" title={boatName}>
                          {truncateToLastCharEllipsis(boatName, FLEET_SAIL_TYPE_MAX_CHARS)}
                        </td>
                        <td className="min-w-0 px-2 py-2 sm:px-3">
                          <FleetHelmCrewCell
                            handedness={b.handedness}
                            crewTemplate={b.crew_template}
                            ownerDisplayName={ownerDisplayName}
                          />
                        </td>
                        <td className="min-w-0 px-2 py-2 sm:px-3">
                          <div className="text-[0.7rem] leading-snug tabular-nums text-splice-ocean sm:text-xs dark:text-splice-water">
                            <span className="whitespace-nowrap">{formatBoatDateDdMonYy(b.valid_to)}</span>
                          </div>
                        </td>
                        <td className="min-w-[10.5rem] whitespace-nowrap py-2 pl-2 pr-4 text-right align-middle sm:min-w-[11rem] sm:pl-3 sm:pr-5">
                          <div className="flex flex-nowrap items-center justify-end gap-2">
                            <Link
                              href={`/fleet/${b.id}`}
                              className="inline-flex shrink-0 whitespace-nowrap rounded-lg border border-splice-water bg-white px-2.5 py-1 text-xs font-medium text-splice-navy hover:bg-splice-surface dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                            >
                              View
                            </Link>
                            <FleetUndoRetireBoatForm boatId={b.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </main>
    </div>
  );
}
