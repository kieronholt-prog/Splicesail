"use client";

export function TrackUploadForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input
        type="file"
        name="track_file"
        accept=".gpx,.fit,.xml,application/gpx+xml,application/octet-stream"
        required
        className="text-sm"
      />
      <button
        type="submit"
        className="self-start rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
      >
        Upload and match race
      </button>
    </form>
  );
}
