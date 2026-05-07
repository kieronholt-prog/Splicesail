import Link from "next/link";
import { redirect } from "next/navigation";
import { createBoatAction } from "@/app/actions/boats";
import { createClient } from "@/lib/supabase/server";

export default async function NewBoatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/fleet" className="text-blue-600 hover:underline dark:text-blue-400">
            ← Fleet
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Add boat
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Helm and crew slots follow Wave B: tick “use account owner” or enter contacts for that slot.
        </p>

        <form action={createBoatAction} className="mt-8 flex flex-col gap-6">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Boat label
            <input
              name="label"
              required
              placeholder="e.g. Laser 123456"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Class <span className="font-normal text-zinc-500">(optional)</span>
            <input
              name="class_name"
              placeholder="e.g. ILCA 7"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Default sail number <span className="font-normal text-zinc-500">(optional)</span>
            <input
              name="default_sail_number"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Portsmouth number <span className="font-normal text-zinc-500">(PY, optional)</span>
            <input
              name="py_rating"
              type="number"
              min={400}
              max={2500}
              step={1}
              placeholder="e.g. 1103"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Handedness
            <select
              name="handedness"
              required
              defaultValue="double"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="single">Single-handed</option>
              <option value="double">Double-handed</option>
              <option value="triple_plus">Triple-handed or more</option>
            </select>
          </label>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Helm</legend>
            <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input type="checkbox" name="helm_use_owner" value="true" defaultChecked />
              Use account owner as helm
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Helm contact name (if not owner)
              <input
                name="helm_contact_name"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Helm contact phone (optional)
              <input
                name="helm_contact_phone"
                type="tel"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Crew 1 (double / triple)
            </legend>
            <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input type="checkbox" name="crew_1_use_owner" value="true" defaultChecked />
              Use account owner as crew 1
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Crew 1 name (if not owner)
              <input
                name="crew_1_contact_name"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Crew 1 phone (optional)
              <input
                name="crew_1_contact_phone"
                type="tel"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-600">
            <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Crew 2 (triple+ only — ignored for single/double)
            </legend>
            <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input type="checkbox" name="crew_2_use_owner" value="true" />
              Use account owner as crew 2
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Crew 2 name (if not owner)
              <input
                name="crew_2_contact_name"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Crew 2 phone (optional)
              <input
                name="crew_2_contact_phone"
                type="tel"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </fieldset>

          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save boat
          </button>
        </form>
      </main>
    </div>
  );
}
