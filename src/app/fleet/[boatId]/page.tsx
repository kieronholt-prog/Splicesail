import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateBoatAction } from "@/app/actions/boats";
import type { CrewTemplate } from "@/lib/boat-crew";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ boatId: string }>;
};

export default async function EditBoatPage({ params }: Props) {
  const { boatId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: boat, error } = await supabase
    .from("boats")
    .select("id, label, class_name, default_sail_number, handedness, crew_template")
    .eq("id", boatId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error || !boat) {
    notFound();
  }

  const ct = boat.crew_template as CrewTemplate;
  const helm = ct.helm;
  const c1 = ct.crew[0];
  const c2 = ct.crew[1];

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/fleet" className="text-blue-600 hover:underline dark:text-blue-400">
            ← Fleet
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit boat
        </h1>

        <form action={updateBoatAction} className="mt-8 flex flex-col gap-6">
          <input type="hidden" name="boat_id" value={boat.id} />
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Boat label
            <input
              name="label"
              required
              defaultValue={boat.label}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Class <span className="font-normal text-zinc-500">(optional)</span>
            <input
              name="class_name"
              defaultValue={boat.class_name ?? ""}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Default sail number <span className="font-normal text-zinc-500">(optional)</span>
            <input
              name="default_sail_number"
              defaultValue={boat.default_sail_number ?? ""}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-blue-500 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Handedness
            <select
              name="handedness"
              required
              defaultValue={boat.handedness}
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
              <input
                type="checkbox"
                name="helm_use_owner"
                value="true"
                defaultChecked={helm.use_account_owner}
              />
              Use account owner as helm
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Helm contact name (if not owner)
              <input
                name="helm_contact_name"
                defaultValue={helm.contact_name ?? ""}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Helm contact phone (optional)
              <input
                name="helm_contact_phone"
                type="tel"
                defaultValue={helm.contact_phone ?? ""}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Crew 1 (double / triple)
            </legend>
            <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                name="crew_1_use_owner"
                value="true"
                defaultChecked={c1?.use_account_owner ?? false}
              />
              Use account owner as crew 1
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Crew 1 name (if not owner)
              <input
                name="crew_1_contact_name"
                defaultValue={c1?.contact_name ?? ""}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Crew 1 phone (optional)
              <input
                name="crew_1_contact_phone"
                type="tel"
                defaultValue={c1?.contact_phone ?? ""}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-600">
            <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Crew 2 (triple+ only)
            </legend>
            <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                name="crew_2_use_owner"
                value="true"
                defaultChecked={c2?.use_account_owner ?? false}
              />
              Use account owner as crew 2
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Crew 2 name (if not owner)
              <input
                name="crew_2_contact_name"
                defaultValue={c2?.contact_name ?? ""}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Crew 2 phone (optional)
              <input
                name="crew_2_contact_phone"
                type="tel"
                defaultValue={c2?.contact_phone ?? ""}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </fieldset>

          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save changes
          </button>
        </form>
      </main>
    </div>
  );
}
