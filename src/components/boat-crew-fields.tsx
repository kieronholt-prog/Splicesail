"use client";

import { useState } from "react";

type Handedness = "single" | "double" | "triple_plus";

type Props = {
  defaultHandedness: Handedness;
  /** When true, handedness follows the boat class catalogue (hidden field). */
  handednessLocked?: boolean;
  lockedHandedness?: Handedness;
  /** Edit mode: pre-fill crew checkboxes / names from server */
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

export function BoatCrewFields({
  defaultHandedness,
  handednessLocked = false,
  lockedHandedness,
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
  const [handedness, setHandedness] = useState<Handedness>(defaultHandedness);
  const [helmDefaultOwner, setHelmDefaultOwner] = useState(
    () => helmUseOwner && !helmName.trim() && !helmPhone.trim(),
  );
  const [helmNameVal, setHelmNameVal] = useState(helmName);
  const [helmPhoneVal, setHelmPhoneVal] = useState(helmPhone);

  const [c1DefaultOwner, setC1DefaultOwner] = useState(
    () => c1UseOwner && !c1Name.trim() && !c1Phone.trim(),
  );
  const [c1NameVal, setC1NameVal] = useState(c1Name);
  const [c1PhoneVal, setC1PhoneVal] = useState(c1Phone);

  const [c2DefaultOwner, setC2DefaultOwner] = useState(
    () => c2UseOwner && !c2Name.trim() && !c2Phone.trim(),
  );
  const [c2NameVal, setC2NameVal] = useState(c2Name);
  const [c2PhoneVal, setC2PhoneVal] = useState(c2Phone);

  const activeHandedness: Handedness = handednessLocked
    ? (lockedHandedness ?? defaultHandedness)
    : handedness;
  const showC1 = activeHandedness === "double" || activeHandedness === "triple_plus";
  const showC2 = activeHandedness === "triple_plus";

  return (
    <>
      {handednessLocked ? (
        <>
          <input type="hidden" name="handedness" value={activeHandedness} />
          <p className="text-sm text-splice-ocean dark:text-splice-water">
            <strong className="text-splice-navy dark:text-splice-foam">
              {activeHandedness === "single"
                ? "Single-handed"
                : activeHandedness === "double"
                  ? "Double-handed"
                  : "Triple-handed or more"}
            </strong>{" "}
            - from RYA class crew number.
          </p>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
          Handedness
          <select
            name="handedness"
            required
            value={handedness}
            onChange={(e) => setHandedness(e.target.value as Handedness)}
            className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          >
            <option value="single">Single-handed</option>
            <option value="double">Double-handed</option>
            <option value="triple_plus">Triple-handed or more</option>
          </select>
        </label>
      )}
      <fieldset className="flex flex-col gap-3 rounded-lg border border-splice-sky p-4 dark:border-splice-ocean">
        <legend className="text-sm font-medium text-splice-navy-light dark:text-splice-sky">Helm</legend>
        <label className="flex items-center gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
          <input
            type="checkbox"
            name="helm_use_owner"
            value="true"
            checked={helmDefaultOwner}
            onChange={(e) => setHelmDefaultOwner(e.target.checked)}
          />
          Default to account owner
        </label>
        <label className="flex flex-col gap-1 text-sm text-splice-ocean dark:text-splice-water">
          Helm contact name (if not owner)
          <input
            name="helm_contact_name"
            value={helmNameVal}
            onChange={(e) => {
              const v = e.target.value;
              setHelmNameVal(v);
              if (v.trim()) setHelmDefaultOwner(false);
            }}
            className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-splice-ocean dark:text-splice-water">
          Helm contact phone (optional)
          <input
            name="helm_contact_phone"
            type="tel"
            value={helmPhoneVal}
            onChange={(e) => {
              const v = e.target.value;
              setHelmPhoneVal(v);
              if (v.trim()) setHelmDefaultOwner(false);
            }}
            className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
          />
        </label>
      </fieldset>

      {showC1 ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-splice-sky p-4 dark:border-splice-ocean">
          <legend className="text-sm font-medium text-splice-navy-light dark:text-splice-sky">
            Crew 1 (double / triple)
          </legend>
          <label className="flex items-center gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
            <input
              type="checkbox"
              name="crew_1_use_owner"
              value="true"
              checked={c1DefaultOwner}
              onChange={(e) => setC1DefaultOwner(e.target.checked)}
            />
            Default to account owner
          </label>
          <label className="flex flex-col gap-1 text-sm text-splice-ocean dark:text-splice-water">
            Crew 1 name (if not owner)
            <input
              name="crew_1_contact_name"
              value={c1NameVal}
              onChange={(e) => {
                const v = e.target.value;
                setC1NameVal(v);
                if (v.trim()) setC1DefaultOwner(false);
              }}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-splice-ocean dark:text-splice-water">
            Crew 1 phone (optional)
            <input
              name="crew_1_contact_phone"
              type="tel"
              value={c1PhoneVal}
              onChange={(e) => {
                const v = e.target.value;
                setC1PhoneVal(v);
                if (v.trim()) setC1DefaultOwner(false);
              }}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
        </fieldset>
      ) : null}

      {showC2 ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-dashed border-splice-water p-4 dark:border-splice-ocean">
          <legend className="text-sm font-medium text-splice-navy-light dark:text-splice-sky">Crew 2 (triple+)</legend>
          <label className="flex items-center gap-2 text-sm text-splice-navy-light dark:text-splice-sky">
            <input
              type="checkbox"
              name="crew_2_use_owner"
              value="true"
              checked={c2DefaultOwner}
              onChange={(e) => setC2DefaultOwner(e.target.checked)}
            />
            Default to account owner
          </label>
          <label className="flex flex-col gap-1 text-sm text-splice-ocean dark:text-splice-water">
            Crew 2 name (if not owner)
            <input
              name="crew_2_contact_name"
              value={c2NameVal}
              onChange={(e) => {
                const v = e.target.value;
                setC2NameVal(v);
                if (v.trim()) setC2DefaultOwner(false);
              }}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-splice-ocean dark:text-splice-water">
            Crew 2 phone (optional)
            <input
              name="crew_2_contact_phone"
              type="tel"
              value={c2PhoneVal}
              onChange={(e) => {
                const v = e.target.value;
                setC2PhoneVal(v);
                if (v.trim()) setC2DefaultOwner(false);
              }}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
        </fieldset>
      ) : null}
    </>
  );
}
