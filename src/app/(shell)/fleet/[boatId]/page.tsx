import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateBoatAction } from "@/app/actions/boats";
import { BoatRyaClassAndCrewSection } from "@/components/boat-rya-class-and-crew";
import { FleetRemoveBoatForm } from "@/components/fleet-remove-boat-form";
import { FleetUndoRetireBoatForm } from "@/components/fleet-undo-retire-boat-form";
import type { CrewTemplate } from "@/lib/boat-crew";
import { formatBoatDateDdMonYy } from "@/lib/format-boat-list-date";
import { isBoatActiveInFleet } from "@/lib/boat-validity";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchRyaCatalogOptionsForBoatPicker } from "@/lib/rya-catalog-scope";

type Props = {
  params: Promise<{ boatId: string }>;
};

function BoatRecordDates({
  createdAt,
  updatedAt,
}: {
  createdAt: string | null | undefined;
  updatedAt: string | null | undefined;
}) {
  return (
    <div className="text-right text-sm tabular-nums text-splice-ocean dark:text-splice-water">
      <p>Created {formatBoatDateDdMonYy(createdAt)}</p>
      <p>Last changed {formatBoatDateDdMonYy(updatedAt)}</p>
    </div>
  );
}

export default async function EditBoatPage({ params }: Props) {
  const { boatId } = await params;

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: boat, error } = await supabase
    .from("boats")
    .select(
      "id, label, class_name, rya_class_key, default_sail_number, handedness, crew_template, py_rating, valid_to, created_at, updated_at",
    )
    .eq("id", boatId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error || !boat) {
    notFound();
  }

  const isActive = isBoatActiveInFleet((boat as { valid_to?: string | null }).valid_to);

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

  const ct = boat.crew_template as CrewTemplate;
  const helm = ct.helm;
  const c1 = ct.crew[0];
  const c2 = ct.crew[1];

  if (!isActive) {
    return (
      <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
        <main className="mx-auto w-full max-w-lg rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
          <p className="text-sm text-splice-ocean dark:text-splice-water">
            <Link href="/fleet" className="text-splice-blue hover:underline dark:text-splice-water">
              ← My boats
            </Link>
          </p>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">Retired hull</h1>
            <BoatRecordDates createdAt={boat.created_at} updatedAt={boat.updated_at} />
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            This boat was removed from your active fleet but is kept for past race results. Undo Remove to edit it again
            and attach it to series.
          </p>
          <dl className="mt-6 space-y-2 text-sm text-splice-navy-light dark:text-splice-sky">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-splice-blue">Sail number</dt>
              <dd className="mt-0.5 tabular-nums">{boat.default_sail_number?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-splice-blue">Boat name</dt>
              <dd className="mt-0.5">{(boat.label ?? "").trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-splice-blue">Class</dt>
              <dd className="mt-0.5">{(boat.class_name ?? "").trim() || boat.rya_class_key || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-splice-blue">Portsmouth Yardstick</dt>
              <dd className="mt-0.5">{boat.py_rating ?? "—"}</dd>
            </div>
          </dl>
          <div className="mt-8">
            <FleetUndoRetireBoatForm boatId={boat.id} fullWidth />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-lg rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link href="/fleet" className="text-splice-blue hover:underline dark:text-splice-water">
            ← My boats
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">Edit boat</h1>
          <BoatRecordDates createdAt={boat.created_at} updatedAt={boat.updated_at} />
        </div>

        <form action={updateBoatAction} className="mt-8 flex flex-col gap-6">
          <input type="hidden" name="boat_id" value={boat.id} />
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Sail number
            <input
              name="default_sail_number"
              required
              autoComplete="off"
              defaultValue={boat.default_sail_number ?? ""}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>

          <BoatRyaClassAndCrewSection
            catalog={catalog}
            defaultRyaClassKey={boat.rya_class_key ?? ""}
            middleSlot={
              <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
                Boat name <span className="font-normal text-splice-blue">(optional)</span>
                <input
                  name="label"
                  defaultValue={boat.label ?? ""}
                  className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
                />
              </label>
            }
            helmUseOwner={helm.use_account_owner}
            helmName={helm.contact_name ?? ""}
            helmPhone={helm.contact_phone ?? ""}
            c1UseOwner={c1?.use_account_owner ?? false}
            c1Name={c1?.contact_name ?? ""}
            c1Phone={c1?.contact_phone ?? ""}
            c2UseOwner={c2?.use_account_owner ?? false}
            c2Name={c2?.contact_name ?? ""}
            c2Phone={c2?.contact_phone ?? ""}
          />

          <button
            type="submit"
            className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
          >
            Save changes
          </button>
        </form>

        <div className="mt-10 border-t border-splice-sky pt-6 dark:border-splice-ocean">
          <h2 className="text-sm font-semibold text-splice-navy dark:text-splice-surface">Delete / Remove</h2>
          <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">
            Remove this hull from your active fleet. If it has race history, it moves to{" "}
            <strong className="text-splice-ocean dark:text-splice-water">Retired hulls</strong> and can be undone from My boats.
          </p>
          <FleetRemoveBoatForm boatId={boat.id} variant="edit" />
        </div>
      </main>
    </div>
  );
}
