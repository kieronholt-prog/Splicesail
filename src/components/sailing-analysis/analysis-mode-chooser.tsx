import { setAnalysisModeAction } from "@/app/actions/track-submissions";

export function AnalysisModeChooser({ submissionId }: { submissionId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form action={setAnalysisModeAction} className="rounded-xl border border-splice-sky p-6 dark:border-splice-ocean">
        <input type="hidden" name="submission_id" value={submissionId} />
        <input type="hidden" name="analysis_mode" value="standalone" />
        <h2 className="text-lg font-semibold text-splice-navy dark:text-splice-foam">Standalone analysis</h2>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Set up course and marks yourself for personal performance insight. Only you see this analysis.
        </p>
        <button
          type="submit"
          className="mt-4 rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
        >
          Continue to setup
        </button>
      </form>

      <form action={setAnalysisModeAction} className="rounded-xl border border-splice-sky p-6 dark:border-splice-ocean">
        <input type="hidden" name="submission_id" value={submissionId} />
        <input type="hidden" name="analysis_mode" value="collated" />
        <h2 className="text-lg font-semibold text-splice-navy dark:text-splice-foam">
          Race finish &amp; fleet insight
        </h2>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Share your track with the race officer for official course setup. When ready, you will see collated fleet
          tracks and combined analysis.
        </p>
        <button
          type="submit"
          className="mt-4 rounded-lg border border-splice-navy px-4 py-2 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
        >
          Request RO setup
        </button>
      </form>
    </div>
  );
}
