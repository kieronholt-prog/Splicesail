"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setWorkModeAction } from "@/app/actions/work-mode";
import { WorkModeSwitchStatus } from "@/components/work-mode-switch-status";
import {
  prefetchWorkModeTargets,
  readWorkModeLastPath,
} from "@/lib/work-mode-last-path";
import {
  resolveWorkModeSwitchHref,
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
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const [targetMode, setTargetMode] = useState<WorkMode | null>(null);
  const [navigating, startNavigation] = useTransition();

  useEffect(() => {
    prefetchWorkModeTargets((href) => router.prefetch(href), availableModes);
  }, [availableModes, router]);

  useEffect(() => {
    setTargetMode(null);
  }, [mode]);

  if (availableModes.length < 2) return null;

  function selectMode(target: WorkMode) {
    if (target === mode) return;
    const form = formRef.current;
    const targetInput = targetRef.current;
    if (!form || !targetInput) return;

    targetInput.value = target;
    setTargetMode(target);
    form.requestSubmit();
  }

  async function switchMode(formData: FormData) {
    const { mode: next } = await setWorkModeAction(formData);
    const href = resolveWorkModeSwitchHref(next, readWorkModeLastPath(next));
    startNavigation(() => {
      router.push(href);
    });
  }

  return (
    <form ref={formRef} action={switchMode} className="inline-flex">
      <WorkModeSwitchStatus targetMode={targetMode} navigating={navigating} />
      <input ref={targetRef} type="hidden" name="target" defaultValue={mode} />
      <input type="hidden" name="available" value={availableModes.join(",")} />
      <div
        role="group"
        aria-label="Work mode"
        className={workModePillsContainerClass(mode)}
        aria-busy={targetMode != null || navigating || undefined}
      >
        {availableModes.map((pillMode) => {
          const selected = pillMode === mode;
          const switchingTo = targetMode === pillMode;
          return (
            <button
              key={pillMode}
              type="button"
              aria-pressed={selected}
              aria-current={selected ? "true" : undefined}
              disabled={selected || targetMode != null}
              title={
                selected
                  ? `${workModeLabel(pillMode)} mode (current)`
                  : `Switch to ${workModeLabel(pillMode)} mode`
              }
              className={
                selected
                  ? workModePillSelectedClass(pillMode)
                  : workModePillIdleClass(mode)
              }
              onClick={() => selectMode(pillMode)}
            >
              {switchingTo ? "…" : workModeShortLabel(pillMode)}
            </button>
          );
        })}
      </div>
    </form>
  );
}
