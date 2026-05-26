"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteGroupClassPyAction, upsertGroupClassPyAction } from "@/app/actions/class-py-overrides";
import {
  createClubHullClassAction,
  deleteClubHullClassAction,
  updateClubHullClassDescriptorsAction,
  upsertBoatClassBaselinePyAction,
} from "@/app/actions/club-hull-classes";
export type NationalDropdownOptionVm = {
  key: string;
  label: string;
};

export type PortsmouthOverrideVm = {
  classKey: string;
  displayName: string;
  clubPy: number;
  ryaPy: number | null;
};

export type ClubHullVm = {
  classKey: string;
  displayName: string;
  baselinePy: number | null;
};

export type ClassListCatalogRowVm = {
  classKey: string;
  displayName: string;
  baselinePy: number | null;
  category: string | null;
  crewCount: number | null;
  rig: string | null;
  spinnaker: string | null;
  keel: string | null;
  engine: string | null;
  isClubDefined: boolean;
};

export type BoatClassAttrOptions = {
  categories: string[];
  crewCounts: number[];
  rigs: string[];
  spinnakers: string[];
  keels: string[];
  engines: string[];
};

export type Props = {
  groupId: string;
  /** When true (e.g. `?class_list=1` after adding a hull), open the Class list modal on first paint. */
  openClassListOnLoad?: boolean;
  nationalDropdown: NationalDropdownOptionVm[];
  overrideRows: PortsmouthOverrideVm[];
  hullRows: ClubHullVm[];
  attributeOptions: BoatClassAttrOptions;
  classListCatalog: ClassListCatalogRowVm[];
};

type PanelOpen = null | "addClass" | "assignHandicap" | "classList";

const CLASS_LIST_QUERY = "class_list";

function dash(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

function classListRowMatchesQuery(row: ClassListCatalogRowVm, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const origin = row.isClubDefined ? "club defined" : "rya catalogue";
  const hay = [
    row.displayName,
    row.classKey,
    row.category,
    row.rig,
    row.spinnaker,
    row.keel,
    row.engine,
    origin,
    row.baselinePy != null ? String(row.baselinePy) : "",
    row.crewCount != null ? String(row.crewCount) : "",
  ]
    .map((v) => (v != null && v !== "" ? String(v) : ""))
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function OptionalStrSelect(props: {
  label: string;
  name: string;
  emptyLabel: string;
  values: readonly string[];
  /** When set (e.g. amend form), selects this option initially. */
  initialValue?: string;
}) {
  const { label, name, emptyLabel, values, initialValue } = props;
  const def = initialValue?.trim()?.length ? initialValue!.trim() : "";
  const match = values.includes(def);
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
      {label}{" "}
      <span className="font-normal normal-case tracking-normal text-[10px] text-splice-blue dark:text-splice-water">
        (optional)
      </span>
      <select
        name={name}
        className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
        defaultValue={match ? def : ""}
      >
        <option value="">{emptyLabel}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

function OptionalCrewSelect(props: {
  label: string;
  name: string;
  counts: readonly number[];
  initialValue?: number | null;
}) {
  const { label, name, counts, initialValue } = props;
  const def =
    initialValue != null &&
    Number.isFinite(initialValue) &&
    initialValue >= 1 &&
    initialValue <= 20
      ? String(Math.trunc(initialValue))
      : "";
  const match =
    initialValue != null && counts.some((n) => n === Math.trunc(Number(initialValue)));
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
      {label}{" "}
      <span className="font-normal normal-case tracking-normal text-[10px] text-splice-blue dark:text-splice-water">
        (optional)
      </span>
      <select
        name={name}
        className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
        defaultValue={match ? def : ""}
      >
        <option value="">—</option>
        {counts.map((n) => (
          <option key={n} value={String(n)}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModalFrame({
  open,
  close,
  titleId,
  title,
  children,
  panelMaxClassName = "max-w-2xl",
  zOverlay = "z-50",
  showTopExit = false,
  headerActions,
}: {
  open: boolean;
  close: () => void;
  titleId: string;
  title: string;
  children: ReactNode;
  panelMaxClassName?: string;
  zOverlay?: string;
  /** Renders X Exit above the dialog title row (calls `close`). */
  showTopExit?: boolean;
  /** Rendered in the title row before the Close button (e.g. primary action). */
  headerActions?: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (open && e.key === "Escape") close();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className={`fixed inset-0 ${zOverlay} flex items-end justify-center bg-black/50 p-4 sm:items-center`}
      role="presentation"
      onClick={(e) => {
        if (e.target === backdropRef.current) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[min(85vh,calc(100vh-4rem))] w-full ${panelMaxClassName} overflow-y-auto rounded-xl border border-splice-sky bg-white p-5 shadow-lg outline-none dark:border-splice-ocean dark:bg-splice-navy`}
      >
        {showTopExit ? (
          <div className="-mt-2 mb-3 flex justify-end border-b border-splice-foam pb-2 dark:border-splice-navy-light">
            <button
              type="button"
              onClick={close}
              className="text-sm font-medium text-splice-ocean underline-offset-4 hover:text-splice-navy hover:underline dark:text-splice-water dark:hover:text-splice-foam"
            >
              X Exit
            </button>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-4 border-b border-splice-sky pb-4 dark:border-splice-ocean">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
            {title}
          </h2>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {headerActions}
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-splice-water px-3 py-1.5 text-sm font-medium text-splice-navy-light dark:border-splice-ocean dark:text-splice-sky"
            >
              Close
            </button>
          </div>
        </div>
        <div className="pt-4">{children}</div>
      </div>
    </div>
  );
}

export function ClubAdminPyHullModalsClient(props: Props) {
  const {
    groupId,
    openClassListOnLoad = false,
    nationalDropdown,
    overrideRows,
    hullRows,
    attributeOptions,
    classListCatalog,
  } = props;
  const [panel, setPanel] = useState<PanelOpen>(() => (openClassListOnLoad ? "classList" : null));
  const [amendingRow, setAmendingRow] = useState<ClassListCatalogRowVm | null>(null);

  /** When opening Assign Handicap from toolbar: both null. From class list national link: prefilled select. */
  const [assignNationalPrefill, setAssignNationalPrefill] = useState<string | null>(null);
  const [assignBaselineScrollKey, setAssignBaselineScrollKey] = useState<string | null>(null);
  const [classListSearch, setClassListSearch] = useState("");

  const addClassTitleId = useId();
  const assignTitleId = useId();
  const listTitleId = useId();
  const listFilterInputId = useId();
  const amendTitleId = useId();

  const a = attributeOptions;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function closeAssignExtras() {
    setAssignNationalPrefill(null);
    setAssignBaselineScrollKey(null);
  }

  function closePanels() {
    setPanel(null);
    setClassListSearch("");
    closeAssignExtras();
  }

  /** Closes any class tool panel and opens Assign Handicap with list-driven focus. */
  function goToAssignModalFromClassList(opts: { nationalClassKey?: string; baselineHullClassKey?: string }) {
    setAssignNationalPrefill(opts.nationalClassKey ?? null);
    setAssignBaselineScrollKey(opts.baselineHullClassKey ?? null);
    setPanel("assignHandicap");
  }

  function closeAmendOnly() {
    setAmendingRow(null);
  }

  useEffect(() => {
    if (searchParams.get(CLASS_LIST_QUERY) !== "1") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete(CLASS_LIST_QUERY);
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const filteredClassListCatalog = useMemo(
    () => classListCatalog.filter((row) => classListRowMatchesQuery(row, classListSearch)),
    [classListCatalog, classListSearch],
  );

  useEffect(() => {
    if (panel !== "assignHandicap") return;
    requestAnimationFrame(() => {
      if (assignBaselineScrollKey) {
        document.getElementById(`assign-baseline-${assignBaselineScrollKey}`)?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      } else if (assignNationalPrefill) {
        document.getElementById("national-override-tools")?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      }
    });
  }, [panel, assignBaselineScrollKey, assignNationalPrefill]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPanel("classList")}
            className="inline-flex shrink-0 justify-center rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy transition hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-surface dark:hover:bg-splice-navy"
          >
            Class list
          </button>
        </div>
        <Link
          href={`/groups/${groupId}#club-series-maint`}
          className="inline-flex w-fit shrink-0 justify-center rounded-lg border border-splice-water bg-white px-4 py-2 text-sm font-medium text-splice-navy transition hover:bg-splice-foam dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-surface dark:hover:bg-splice-navy"
        >
          Series scoring settings
        </Link>
      </div>

      <ModalFrame open={panel === "classList"} close={closePanels} titleId={`${listTitleId}-dialog`} title="Class list" panelMaxClassName="max-w-[min(90rem,calc(100vw-2rem))]">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setPanel("addClass")}
            className="inline-flex shrink-0 justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Add Class
          </button>
        </div>
        <p className="text-xs text-splice-ocean dark:text-splice-water">
          National catalogue fields are read-only. Venue hull rows can be amended (not their Portsmouth number here — use the
          links to open handicap tools). PN is always the baseline in <strong className="text-splice-navy-light dark:text-splice-sky">boat_class_pn</strong>{" "}
          (national RYA PN plus club hull baselines).
        </p>

        <div className="mt-3">
          <label htmlFor={listFilterInputId} className="mb-1.5 block text-xs font-medium text-splice-ocean dark:text-splice-water">
            Search
          </label>
          <input
            id={listFilterInputId}
            type="search"
            value={classListSearch}
            onChange={(e) => setClassListSearch(e.target.value)}
            placeholder="Search classes…"
            autoComplete="off"
            className="w-full max-w-md rounded-lg border border-splice-water bg-white px-3 py-2 text-sm text-splice-navy shadow-sm placeholder:text-splice-water focus:border-splice-blue focus:outline-none focus:ring-2 focus:ring-splice-water/30 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam dark:placeholder:text-splice-blue dark:focus:border-splice-blue dark:focus:ring-splice-blue/25"
          />
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-ocean">
          <table className="min-w-[920px] w-full text-left text-xs">
            <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
              <tr>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Class</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">PN</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Category</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Crew</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Rig</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Spinnaker</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Keel</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Engine</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Origin</th>
                <th className="px-2 py-2 font-medium text-splice-ocean dark:text-splice-water">Descriptors / PN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-splice-foam dark:divide-splice-navy-light">
              {!classListCatalog.length ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-sm text-splice-blue">
                    No classes matched this venue.
                  </td>
                </tr>
              ) : !filteredClassListCatalog.length ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-sm text-splice-blue">
                    No classes match your search.
                  </td>
                </tr>
              ) : (
                filteredClassListCatalog.map((row) => (
                  <tr key={row.classKey} className="align-top">
                    <td className="px-2 py-2">
                      <p className="font-medium text-splice-navy dark:text-splice-foam">{row.displayName}</p>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-splice-navy-light dark:text-splice-sky">{dash(row.baselinePy)}</td>
                    <td className="px-2 py-2">{dash(row.category)}</td>
                    <td className="px-2 py-2 tabular-nums">{dash(row.crewCount)}</td>
                    <td className="px-2 py-2">{dash(row.rig)}</td>
                    <td className="px-2 py-2">{dash(row.spinnaker)}</td>
                    <td className="px-2 py-2">{dash(row.keel)}</td>
                    <td className="px-2 py-2">{dash(row.engine)}</td>
                    <td className="px-2 py-2 text-splice-ocean dark:text-splice-water">
                      {row.isClubDefined ? "Club Defined" : "RYA Catalogue"}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-2">
                        {row.isClubDefined ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPanel(null);
                              setAmendingRow(row);
                            }}
                            className="text-left text-xs font-medium text-splice-blue underline-offset-4 hover:underline dark:text-splice-water"
                          >
                            Amend descriptors
                          </button>
                        ) : (
                          <span className="text-[11px] text-splice-blue dark:text-splice-water">RYA descriptors are fixed.</span>
                        )}
                        {row.isClubDefined ? (
                          <button
                            type="button"
                            onClick={() => goToAssignModalFromClassList({ baselineHullClassKey: row.classKey })}
                            className="text-left text-xs font-medium text-splice-blue underline-offset-4 hover:underline dark:text-splice-water"
                          >
                            Baseline PN (boat_class_pn)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => goToAssignModalFromClassList({ nationalClassKey: row.classKey })}
                            className="text-left text-xs font-medium text-splice-blue underline-offset-4 hover:underline dark:text-splice-water"
                          >
                            Club override PN (vs RYA baseline)
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ModalFrame>

      <ModalFrame
        open={panel === "addClass"}
        close={closePanels}
        titleId={`${addClassTitleId}-dialog`}
        title="ADD or REMOVE CLASS"
        headerActions={
          <button
            type="submit"
            form={`club-hull-new-${groupId}-modal`}
            className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Add
          </button>
        }
      >
        <section>
          <form id={`club-hull-new-${groupId}-modal`} action={createClubHullClassAction} className="space-y-4">
            <input type="hidden" name="group_id" value={groupId} />
            <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
              New Class
              <input
                name="display_name"
                type="text"
                required
                placeholder='e.g. "Club handicap dinghy"'
                className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
              />
            </label>

            <p className="text-[11px] text-splice-blue dark:text-splice-water">
              Match national catalogue fields when helpful — dropdown values come from seeded RYA classes in the database.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <OptionalStrSelect label="Category" name="category" emptyLabel="—" values={a.categories} />
              <OptionalCrewSelect label="Crew count" name="crew_count" counts={a.crewCounts} />
              <OptionalStrSelect label="Rig" name="rig" emptyLabel="—" values={a.rigs} />
              <OptionalStrSelect label="Spinnaker" name="spinnaker" emptyLabel="—" values={a.spinnakers} />
              <OptionalStrSelect label="Keel" name="keel" emptyLabel="—" values={a.keels} />
              <OptionalStrSelect label="Engine" name="engine" emptyLabel="—" values={a.engines} />
            </div>
          </form>

          <div className="mt-8 overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-ocean">
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                <tr>
                  <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Club Class</th>
                  <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Handicap</th>
                  <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                {!hullRows.length ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-xs text-splice-blue">
                      No club-defined hull classes yet — use the form above.
                    </td>
                  </tr>
                ) : (
                  hullRows.map((row) => (
                    <tr key={row.classKey}>
                      <td className="px-3 py-2 text-splice-navy dark:text-splice-foam">{row.displayName}</td>
                      <td className="px-3 py-2 tabular-nums text-splice-navy-light dark:text-splice-sky">
                        {row.baselinePy != null ? row.baselinePy : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <form action={deleteClubHullClassAction} className="inline">
                          <input type="hidden" name="group_id" value={groupId} />
                          <input type="hidden" name="class_key" value={row.classKey} />
                          <button
                            type="submit"
                            className="text-xs font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </ModalFrame>

      <ModalFrame
        open={panel === "assignHandicap"}
        close={closePanels}
        titleId={`${assignTitleId}-dialog`}
        title="Assign Handicaps"
        showTopExit
      >
        <div>
          <p className="text-xs text-splice-ocean dark:text-splice-water">
            Set Handicaps for Club Classes or Override standard handicaps at club level.
          </p>

          <section className="mt-6 border-t border-splice-sky pt-6 dark:border-splice-ocean">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
              Club class handicaps
            </h4>
            <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
              New Club Classes provisionally entered at 1200 can be amended below.
            </p>
            {!hullRows.length ? (
              <p className="mt-3 text-sm text-splice-blue dark:text-splice-water">No club hull classes yet — use Add Class first.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-ocean">
                <table className="w-full min-w-[460px] text-left text-sm">
                  <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                    <tr>
                      <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Class</th>
                      <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Baseline PN</th>
                      <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                    {hullRows.map((row) => (
                      <tr key={`base-${row.classKey}`} id={`assign-baseline-${row.classKey}`}>
                        <td className="px-3 py-2 text-splice-navy dark:text-splice-foam">{row.displayName}</td>
                        <td className="px-3 py-2 tabular-nums text-splice-ocean dark:text-splice-water">
                          {row.baselinePy ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <form action={upsertBoatClassBaselinePyAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="group_id" value={groupId} />
                            <input type="hidden" name="class_key" value={row.classKey} />
                            <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                              PN
                              <input
                                name="py"
                                type="number"
                                min={400}
                                max={2500}
                                required
                                defaultValue={row.baselinePy ?? 1200}
                                className="w-28 rounded-lg border border-splice-water bg-white px-2 py-1.5 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                              />
                            </label>
                            <button
                              type="submit"
                              className="rounded-lg bg-splice-navy px-3 py-1.5 text-xs font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                            >
                              Save
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-8 border-t border-splice-sky pt-8 dark:border-splice-navy-light">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
              Overrides (national RYA classes)
            </h4>
            <p className="mt-2 text-xs text-splice-ocean dark:text-splice-water">
              Club PN overrides listed below replace the catalogue baseline PN for nationals at this venue; they fold into the
              same resolution chain ahead of hull baseline rows.
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-splice-sky dark:border-splice-ocean">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-splice-sky bg-splice-surface dark:border-splice-navy-light dark:bg-splice-navy">
                  <tr>
                    <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Class</th>
                    <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Club PN</th>
                    <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">RYA baseline</th>
                    <th className="px-3 py-2 font-medium text-splice-ocean dark:text-splice-water">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-splice-sky dark:divide-splice-navy-light">
                  {!overrideRows.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-xs text-splice-blue">
                        No PN overrides yet — boats use catalogue baselines until you save one below.
                      </td>
                    </tr>
                  ) : (
                    overrideRows.map((row) => (
                      <tr key={row.classKey}>
                        <td className="px-3 py-2 text-splice-navy dark:text-splice-foam">{row.displayName}</td>
                        <td className="px-3 py-2 tabular-nums text-splice-navy dark:text-splice-surface">{row.clubPy}</td>
                        <td className="px-3 py-2 tabular-nums text-splice-blue">{row.ryaPy ?? "—"}</td>
                        <td className="px-3 py-2">
                          <form action={deleteGroupClassPyAction} className="inline">
                            <input type="hidden" name="group_id" value={groupId} />
                            <input type="hidden" name="class_key" value={row.classKey} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400"
                            >
                              Remove
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div id="national-override-tools" className="scroll-mt-6">
              <form
                key={assignNationalPrefill ?? "unset"}
                id={`national-py-override-${groupId}-modal`}
                action={upsertGroupClassPyAction}
                className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
              >
                <input type="hidden" name="group_id" value={groupId} />
                <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                  National class (RYA list)
                  <select
                    name="class_key"
                    required
                    className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                    defaultValue={assignNationalPrefill ?? ""}
                  >
                    <option value="" disabled>
                      Choose class…
                    </option>
                    {nationalDropdown.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-28 flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                  Club PN
                  <input
                    name="py"
                    type="number"
                    min={400}
                    max={2500}
                    required
                    placeholder="e.g. 1145"
                    className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                >
                  Save club override
                </button>
              </form>
            </div>
          </section>
        </div>
      </ModalFrame>

      <ModalFrame
        open={amendingRow != null}
        close={closeAmendOnly}
        titleId={`${amendTitleId}-dialog`}
        title="Amend venue hull class"
        zOverlay="z-[60]"
      >
        {amendingRow ? (
          <>
            <p className="text-xs text-splice-ocean dark:text-splice-water">
              Editable fields mirror the catalogue. Portsmouth numbers stay in Assign Handicap → venue baseline.
            </p>
            <p className="mt-2 font-mono text-[11px] text-splice-blue dark:text-splice-water">{amendingRow.classKey}</p>
            <form key={amendingRow.classKey} action={updateClubHullClassDescriptorsAction} className="mt-4 space-y-4">
              <input type="hidden" name="group_id" value={groupId} />
              <input type="hidden" name="class_key" value={amendingRow.classKey} />
              <label className="flex flex-col gap-1 text-xs font-medium text-splice-ocean dark:text-splice-water">
                Display name
                <input
                  name="display_name"
                  type="text"
                  required
                  defaultValue={amendingRow.displayName}
                  className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <OptionalStrSelect
                  label="Category"
                  name="category"
                  emptyLabel="—"
                  values={a.categories}
                  initialValue={amendingRow.category ?? ""}
                />
                <OptionalCrewSelect
                  label="Crew count"
                  name="crew_count"
                  counts={a.crewCounts}
                  initialValue={amendingRow.crewCount}
                />
                <OptionalStrSelect
                  label="Rig"
                  name="rig"
                  emptyLabel="—"
                  values={a.rigs}
                  initialValue={amendingRow.rig ?? ""}
                />
                <OptionalStrSelect
                  label="Spinnaker"
                  name="spinnaker"
                  emptyLabel="—"
                  values={a.spinnakers}
                  initialValue={amendingRow.spinnaker ?? ""}
                />
                <OptionalStrSelect
                  label="Keel"
                  name="keel"
                  emptyLabel="—"
                  values={a.keels}
                  initialValue={amendingRow.keel ?? ""}
                />
                <OptionalStrSelect
                  label="Engine"
                  name="engine"
                  emptyLabel="—"
                  values={a.engines}
                  initialValue={amendingRow.engine ?? ""}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
                >
                  Save descriptors
                </button>
                <button
                  type="button"
                  onClick={closeAmendOnly}
                  className="rounded-lg border border-splice-water px-4 py-2 text-sm font-medium dark:border-splice-ocean"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        ) : null}
      </ModalFrame>
    </>
  );
}
