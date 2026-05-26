"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { BoatCrewFields } from "@/components/boat-crew-fields";
import { handednessFromCrewCount } from "@/lib/rya-crew";

export type RyaCatalogOption = {
  class_key: string;
  display_name: string | null;
  py: number | null;
  crew_count: number | null;
};

type Props = {
  catalog: RyaCatalogOption[];
  /** Catalogue key saved on boats.rya_class_key */
  defaultRyaClassKey?: string | null;
  /** Rendered after class + Portsmouth Yardstick (e.g. boat name). */
  middleSlot?: ReactNode;
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

/** When no class row is selected yet, crew layout defaults mirror previous “double-handed” boat form. */
const FALLBACK_BEFORE_CLASS = handednessFromCrewCount(2);

export function BoatRyaClassAndCrewSection({
  catalog,
  defaultRyaClassKey = "",
  middleSlot,
  helmUseOwner,
  helmName,
  helmPhone,
  c1UseOwner,
  c1Name,
  c1Phone,
  c2UseOwner,
  c2Name,
  c2Phone,
}: Props) {
  const sorted = useMemo(
    () => [...catalog].sort((a, b) => String(a.display_name).localeCompare(String(b.display_name))),
    [catalog],
  );

  const [ryKey, setRyKey] = useState(defaultRyaClassKey ?? "");

  const row = sorted.find((c) => c.class_key === ryKey);
  const effectiveHand = row ? handednessFromCrewCount(row.crew_count) : FALLBACK_BEFORE_CLASS;
  return (
    <>
      <div className="flex flex-nowrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
          Class
          <select
            name="rya_class_key"
            required
            value={ryKey}
            onChange={(e) => setRyKey(e.target.value)}
            className="min-w-0 w-full rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          >
            <option value="">Choose class…</option>
            {sorted.map((c) => (
              <option key={c.class_key} value={c.class_key}>
                {c.display_name ?? c.class_key}
              </option>
            ))}
          </select>
        </label>

        <div className="flex w-[10.25rem] shrink-0 flex-col gap-1 sm:w-36">
          <p className="text-xs font-medium leading-tight text-splice-ocean sm:text-sm dark:text-splice-water">
            Portsmouth Yardstick
          </p>
          <div
            className="flex min-h-[2.625rem] items-center rounded-lg border border-splice-sky bg-splice-surface px-3 py-2 text-sm tabular-nums text-splice-navy-light dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-sky"
            aria-live="polite"
          >
            {row?.py != null ? row.py : "—"}
          </div>
        </div>
      </div>

      {middleSlot}

      <BoatCrewFields
        key={`${ryKey}:${effectiveHand}`}
        defaultHandedness={effectiveHand}
        handednessLocked
        lockedHandedness={effectiveHand}
        helmUseOwner={helmUseOwner}
        helmName={helmName}
        helmPhone={helmPhone}
        c1UseOwner={c1UseOwner}
        c1Name={c1Name}
        c1Phone={c1Phone}
        c2UseOwner={c2UseOwner}
        c2Name={c2Name}
        c2Phone={c2Phone}
      />
    </>
  );
}
