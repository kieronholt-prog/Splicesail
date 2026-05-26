"use client";

export function WindRose({
  windDeg,
  onChange,
  compact,
  hint,
}: {
  windDeg: number;
  onChange?: (deg: number) => void;
  compact?: boolean;
  hint?: string;
}) {
  const dia = compact ? 86 : 100;
  const pad = compact ? 10 : 16;

  return (
    <div className="rounded-xl border border-splice-sky bg-white p-3 text-center dark:border-splice-ocean dark:bg-splice-navy">
      <p className="text-[11px] font-medium uppercase tracking-wide text-splice-ocean dark:text-splice-water">
        Wind (from)
      </p>
      <div
        className="relative mx-auto my-2 rounded-full border-2 border-splice-sky dark:border-splice-ocean"
        style={{ width: dia, height: dia }}
      >
        {(["N", "E", "S", "W"] as const).map((d, i) => (
          <span
            key={d}
            className="absolute text-[10px] font-semibold text-splice-ocean dark:text-splice-water"
            style={
              [
                { top: 2, left: "50%", transform: "translateX(-50%)" },
                { right: 4, top: "50%", transform: "translateY(-50%)" },
                { bottom: 2, left: "50%", transform: "translateX(-50%)" },
                { left: 4, top: "50%", transform: "translateY(-50%)" },
              ][i]
            }
          >
            {d}
          </span>
        ))}
        <div
          className="absolute left-1/2 top-1/2 w-0.5 rounded bg-amber-400"
          style={{
            height: dia * 0.38,
            transform: `translate(-50%, -100%) rotate(${windDeg}deg)`,
            transformOrigin: "bottom center",
          }}
        />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400" />
      </div>
      {onChange ? (
        <div className="flex flex-wrap items-center justify-center gap-2" style={{ padding: `0 ${pad}px` }}>
          <input
            type="range"
            min={0}
            max={359}
            value={windDeg}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            className="min-w-[60px] flex-1"
          />
          <span className="min-w-[2.5rem] font-mono text-base font-bold text-splice-blue">{windDeg}°</span>
        </div>
      ) : (
        <p className="font-mono text-base font-bold text-splice-blue">{windDeg}°</p>
      )}
      {hint ? <p className="mt-2 text-[9px] leading-snug text-splice-ocean dark:text-splice-water">{hint}</p> : null}
    </div>
  );
}
