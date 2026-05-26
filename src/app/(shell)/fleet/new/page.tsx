import Link from "next/link";
import { redirect } from "next/navigation";
import { createBoatAction } from "@/app/actions/boats";
import { BoatRyaClassAndCrewSection } from "@/components/boat-rya-class-and-crew";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchRyaCatalogOptionsForBoatPicker } from "@/lib/rya-catalog-scope";

export default async function NewBoatPage() {
  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const catalogOpts = await fetchRyaCatalogOptionsForBoatPicker(supabase, user.id);

  const catalog = catalogOpts.map((r) => ({
    class_key: r.class_key,
    display_name: r.display_name ?? null,
    py: r.py ?? null,
    crew_count:
      r.crew_count != null && String(r.crew_count).trim() !== ""
        ? Math.trunc(Number(r.crew_count))
        : null,
  }));

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-lg rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link href="/fleet" className="text-splice-blue hover:underline dark:text-splice-water">
            ← My boats
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">
          Add boat
        </h1>
        <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">
          Pick the official RYA boat class — Portsmouth number and crew layout follow that row. Helm and crew
          slots: tick “Default to account owner” or enter contacts for each slot shown.
        </p>

        <form action={createBoatAction} className="mt-8 flex flex-col gap-6">
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Sail number
            <input
              name="default_sail_number"
              required
              autoComplete="off"
              placeholder="e.g. 123456"
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>

          <BoatRyaClassAndCrewSection
            catalog={catalog}
            defaultRyaClassKey=""
            middleSlot={
              <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
                Boat name <span className="font-normal text-splice-blue">(optional)</span>
                <input
                  name="label"
                  placeholder="e.g. Club nickname for this dinghy"
                  className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                />
              </label>
            }
            helmUseOwner
            helmName=""
            helmPhone=""
            c1UseOwner
            c1Name=""
            c1Phone=""
            c2UseOwner={false}
            c2Name=""
            c2Phone=""
          />

          <button
            type="submit"
            className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
          >
            Save boat
          </button>
        </form>
      </main>
    </div>
  );
}
