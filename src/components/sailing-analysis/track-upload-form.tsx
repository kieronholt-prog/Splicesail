"use client";

import { useRef, useState } from "react";

function FilePlusIcon({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex ${className ?? ""}`}>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        className="size-10 text-splice-ocean dark:text-splice-water"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M12 18v-6M9 15h6" />
      </svg>
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-splice-navy text-sm font-bold leading-none text-white dark:bg-splice-foam dark:text-splice-navy"
      >
        +
      </span>
    </span>
  );
}

export function TrackUploadForm({ action }: { action: (formData: FormData) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        name="track_file"
        accept=".gpx,.fit,.xml,application/gpx+xml,application/octet-stream"
        required
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          setFileName(file?.name ?? null);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center gap-4 rounded-xl border-2 border-dashed border-splice-water bg-splice-surface/80 px-4 py-5 text-left transition-colors hover:border-splice-ocean hover:bg-splice-foam/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-splice-blue dark:border-splice-ocean dark:bg-splice-navy-light/30 dark:hover:border-splice-water dark:hover:bg-splice-navy-light/50"
      >
        <FilePlusIcon />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-splice-navy dark:text-splice-foam">
            {fileName ? "File selected" : "Choose file"}
          </span>
          <span className="mt-0.5 block text-sm text-splice-navy-light dark:text-splice-water">
            {fileName ?? "Click here to browse — GPX or FIT from your device"}
          </span>
        </span>
      </button>

      <p className="text-xs text-splice-ocean dark:text-splice-water">
        Tap <strong className="font-semibold text-splice-navy dark:text-splice-foam">Choose file</strong> above
        {fileName ? ` · ${fileName}` : " — no file chosen yet"}
      </p>

      <button
        type="submit"
        disabled={!fileName}
        className="self-start rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-splice-foam dark:text-splice-navy"
      >
        Upload and match race
      </button>
    </form>
  );
}
