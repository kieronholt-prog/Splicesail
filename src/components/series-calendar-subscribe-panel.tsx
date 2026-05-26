"use client";

import { useState, useTransition } from "react";
import { revokeSeriesCalendarFeedAction } from "@/app/actions/series-calendar-feed";

type Props = {
  groupId: string;
  seriesId: string;
  seriesName: string;
  subscribeUrlHttps: string;
  webcalUrl: string;
  googleCalendarUrl: string;
  outlookCalendarUrl: string;
  downloadUrl: string;
};

function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  }
  return Promise.resolve(false);
}

export function SeriesCalendarSubscribePanel({
  groupId,
  seriesId,
  seriesName,
  subscribeUrlHttps,
  webcalUrl,
  googleCalendarUrl,
  outlookCalendarUrl,
  downloadUrl,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokePending, startRevoke] = useTransition();

  async function handleCopy() {
    const ok = await copyToClipboard(subscribeUrlHttps);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleRevoke() {
    setRevokeError(null);
    startRevoke(async () => {
      const fd = new FormData();
      fd.set("group_id", groupId);
      fd.set("series_id", seriesId);
      const res = await revokeSeriesCalendarFeedAction(fd);
      if (res?.error) {
        setRevokeError(res.error);
      } else {
        window.location.reload();
      }
    });
  }

  const btnClass =
    "inline-flex justify-center rounded-lg border border-splice-water px-3 py-2 text-sm font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam";

  return (
    <div className="flex w-full max-w-xs flex-col gap-2 sm:items-end">
      <p className="text-right text-xs font-medium text-splice-navy dark:text-splice-foam">Sync to your calendar</p>

      <a href={webcalUrl} className={btnClass}>
        Apple Calendar
      </a>
      <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer" className={btnClass}>
        Google Calendar
      </a>
      <a href={outlookCalendarUrl} target="_blank" rel="noopener noreferrer" className={btnClass}>
        Outlook
      </a>

      <button type="button" onClick={handleCopy} className={btnClass}>
        {copied ? "Link copied" : "Copy subscription link"}
      </button>

      <a href={downloadUrl} download className={`${btnClass} text-splice-ocean dark:text-splice-water`}>
        Download .ics once
      </a>

      <button
        type="button"
        onClick={handleRevoke}
        disabled={revokePending}
        className="text-right text-[10px] text-splice-blue underline disabled:opacity-60 dark:text-splice-water"
      >
        {revokePending ? "Resetting link…" : "Reset subscription link"}
      </button>

      <p className="max-w-[16rem] text-right text-[11px] leading-snug text-splice-blue dark:text-splice-water">
        Subscribe once — {seriesName} updates when organisers change dates (your app refreshes every few hours).
        Android usually uses Google Calendar above.
      </p>

      {revokeError ? (
        <p className="max-w-[16rem] text-right text-[11px] text-red-700 dark:text-red-300" role="alert">
          {revokeError}
        </p>
      ) : null}
    </div>
  );
}
