"use client";

import { useEffect, useState } from "react";

type Activity = {
  id: number;
  name: string;
  start_date: string;
  elapsed_time: number;
};

export function StravaActivityPicker({
  linkedName,
  createAction,
}: {
  linkedName: string;
  createAction: (formData: FormData) => void;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strava/activities")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setActivities(d.activities ?? []);
      })
      .catch(() => setError("Could not load activities"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="mt-3 text-sm text-splice-navy-light dark:text-splice-water">Loading Strava activities…</p>;
  }
  if (error) return <p className="mt-3 text-sm text-red-700">{error}</p>;

  return (
    <div className="mt-3">
      <p className="text-sm text-splice-navy-light dark:text-splice-water">Linked as {linkedName}</p>
      <ul className="mt-3 divide-y divide-splice-sky dark:divide-splice-ocean">
        {activities.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="font-medium text-splice-navy dark:text-splice-foam">{a.name}</p>
              <p className="text-xs text-splice-ocean dark:text-splice-water">
                {new Date(a.start_date).toLocaleString()}
              </p>
            </div>
            <form action={createAction}>
              <input type="hidden" name="activity_id" value={String(a.id)} />
              <input type="hidden" name="activity_name" value={a.name} />
              <input type="hidden" name="start_date" value={a.start_date} />
              <input type="hidden" name="elapsed_time" value={String(a.elapsed_time)} />
              <button
                type="submit"
                className="rounded-lg border border-splice-navy px-3 py-1.5 text-sm font-medium text-splice-navy dark:border-splice-foam dark:text-splice-foam"
              >
                Use track
              </button>
            </form>
          </li>
        ))}
      </ul>
      {activities.length === 0 ? (
        <p className="text-sm text-splice-navy-light dark:text-splice-water">
          No recent Sail or Windsurf activities on Strava.
        </p>
      ) : null}
    </div>
  );
}
