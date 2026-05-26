"use client";

import { useState } from "react";
import { createGuestBoatAction } from "@/app/actions/club-guest-sailors";
import {
  ClubGuestBoatClassPicker,
  type BoatClassCatalogOption,
} from "@/components/club-guest-boat-class-picker";

export function ClubGuestBoatCreateForm(props: {
  groupId: string;
  guestSailorId: string;
  boatClassCatalog: BoatClassCatalogOption[];
}) {
  const [classKey, setClassKey] = useState("");
  const [classDisplay, setClassDisplay] = useState("");

  const canSubmit = Boolean(classKey.trim());

  return (
    <form action={createGuestBoatAction} className="mt-3 flex flex-col gap-2 border-t border-splice-sky pt-3 dark:border-splice-navy-light">
      <input type="hidden" name="group_id" value={props.groupId} />
      <input type="hidden" name="guest_sailor_id" value={props.guestSailorId} />
      <input type="hidden" name="rya_class_key" value={classKey} />
      <input type="hidden" name="class_name" value={classDisplay} />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">
        Add boat for this guest sailor
      </p>
      <label className="flex flex-col gap-1 text-[11px] font-medium text-splice-ocean dark:text-splice-water">
        Label / boat name <span className="text-red-600 dark:text-red-400">*</span>
        <input
          name="label"
          required
          className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
        />
      </label>
      <ClubGuestBoatClassPicker
        options={props.boatClassCatalog}
        valueKey={classKey}
        valueDisplay={classDisplay}
        onSelect={(k, d) => {
          setClassKey(k);
          setClassDisplay(d);
        }}
        onClear={() => {
          setClassKey("");
          setClassDisplay("");
        }}
      />
      <label className="flex flex-col gap-1 text-[11px] font-medium text-splice-ocean dark:text-splice-water">
        Sail # <span className="text-red-600 dark:text-red-400">*</span>
        <input
          name="default_sail_number"
          required
          autoComplete="off"
          className="rounded-lg border border-splice-water bg-white px-2 py-2 text-sm dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
        />
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="max-w-fit rounded-lg bg-splice-navy px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy dark:disabled:opacity-40"
      >
        Add boat
      </button>
    </form>
  );
}
