"use client";

import { useRef } from "react";
import { setWorkModeAction } from "@/app/actions/work-mode";
import {
  workModeLabel,
  workModePillIdleClass,
  workModePillSelectedClass,
  workModePillsContainerClass,
  workModeShortLabel,
  type WorkMode,
} from "@/lib/work-mode";

type Props = {
  mode: WorkMode;
  availableModes: WorkMode[];
};

export function WorkModePills({ mode, availableModes }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);

  if (availableModes.length < 2) return null;

  function selectMode(target: WorkMode) {
    if (target === mode) return;
    const form = formRef.current;
    const targetInput = targetRef.current;
    if (!form || !targetInput) return;

    targetInput.value = target;
    form.requestSubmit();
  }

  return (
    <form ref={formRef} action={setWorkModeAction} className="inline-flex">
      <input ref={targetRef} type="hidden" name="target" defaultValue={mode} />
      <input type="hidden" name="available" value={availableModes.join(",")} />
      <div
        role="group"
        aria-label="Work mode"
        className={workModePillsContainerClass(mode)}
      >
        {availableModes.map((pillMode) => {
          const selected = pillMode === mode;
          return (
            <button
              key={pillMode}
              type="button"
              aria-pressed={selected}
              aria-current={selected ? "true" : undefined}
              disabled={selected}
              title={selected ? `${workModeLabel(pillMode)} mode (current)` : `Switch to ${workModeLabel(pillMode)} mode`}
              className={
                selected
                  ? workModePillSelectedClass(pillMode)
                  : workModePillIdleClass(mode)
              }
              onClick={() => selectMode(pillMode)}
            >
              {workModeShortLabel(pillMode)}
            </button>
          );
        })}
      </div>
    </form>
  );
}
