import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deleteGroupFleetAction, updateGroupFleetAction } from "@/app/actions/group-fleets";
import { boatPyFromEmbeddedPnRelation } from "@/lib/boat-class-pn-from-embed";
import { FleetClassPicker } from "@/components/fleet-class-picker";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { marineFlagKeyFromClassFlag, marineFlagPublicSrc } from "@/lib/marine-signal-flags";
import { fetchRyaCatalogOptionsForGroup } from "@/lib/rya-catalog-scope";

type Props = {
  params: Promise<{ id: string; fleetId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function GroupFleetDetailPage({ params, searchParams }: Props) {
  const { id: groupId, fleetId } = await params;
  const q = await searchParams;
  const error = q.error ? decodeURIComponent(q.error) : null;
  const saved = q.saved === "1";

  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const { data: group, error: groupError } = await supabase.from("groups").select("id, name").eq("id", groupId).maybeSingle();

  if (groupError || !group) {
    notFound();
  }

  const { data: fleet, error: fleetError } = await supabase
    .from("group_fleets")
    .select("id, name, description, class_flag")
    .eq("id", fleetId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (fleetError || !fleet) {
    notFound();
  }

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = me?.role === "club_admin";

  const { data: selectedRows } = await supabase.from("group_fleet_classes").select("class_key").eq("fleet_id", fleetId);

  const selectedKeys = (selectedRows ?? []).map((r) => r.class_key);

  let classDetails: { class_key: string; display_name: string; py: number }[] = [];
  if (selectedKeys.length > 0) {
    const { data: rya } = await supabase
      .from("boat_classes")
      .select("class_key, display_name, boat_class_pn(py)")
      .in("class_key", selectedKeys);
    classDetails = [...(rya ?? [])]
      .map((r) => {
        const embed = Array.isArray(r.boat_class_pn) ? r.boat_class_pn[0] : r.boat_class_pn;
        const py = boatPyFromEmbeddedPnRelation(embed);
        return py == null
          ? null
          : {
              class_key: r.class_key,
              display_name: r.display_name,
              py,
            };
      })
      .filter((x): x is { class_key: string; display_name: string; py: number } => x != null)
      .sort((a, b) => a.py - b.py || a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }));
  }

  const catalogRows = await fetchRyaCatalogOptionsForGroup(supabase, groupId);

  const fleetCatalog = catalogRows.map((r) => ({
    class_key: r.class_key,
    display_name: r.display_name,
    py: Number(r.py),
  }));

  const classFlagRaw = fleet.class_flag as string | null;
  const classFlagDisp = classFlagRaw && String(classFlagRaw).trim().length ? String(classFlagRaw).trim() : null;

  if (!isAdmin) {
    return (
      <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
        <main className="mx-auto w-full max-w-2xl">
          <p className="text-sm text-splice-ocean dark:text-splice-water">
            <Link href={`/groups/${groupId}/fleets`} className="text-splice-blue hover:underline dark:text-splice-water">
              ← Club fleets
            </Link>
          </p>
          <h1 className="mt-4 text-xl font-semibold text-splice-navy dark:text-splice-surface">{fleet.name}</h1>
          <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">
            Class flag:{" "}
            {(() => {
              const fk = marineFlagKeyFromClassFlag(classFlagDisp);
              return (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {fk ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local static SVG
                    <img
                      src={marineFlagPublicSrc(fk)}
                      alt=""
                      width={40}
                      height={40}
                      className="rounded border border-splice-sky object-contain dark:border-splice-ocean"
                    />
                  ) : null}
                  <strong className="font-mono text-splice-ocean dark:text-splice-water">{classFlagDisp ?? "—"}</strong>
                </span>
              );
            })()}
          </p>
          {fleet.description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-splice-ocean dark:text-splice-water">{fleet.description}</p>
          ) : null}
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-splice-blue dark:text-splice-water">Classes</h2>
          {classDetails.length === 0 ? (
            <p className="mt-2 text-sm text-splice-ocean dark:text-splice-water">No boat classes configured for this fleet yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-splice-sky rounded-lg border border-splice-sky bg-white dark:divide-splice-navy-light dark:border-splice-navy-light dark:bg-splice-navy">
              {classDetails.map((c) => (
                <li key={c.class_key} className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-splice-navy dark:text-splice-foam">{c.display_name}</span>
                  <span className="tabular-nums text-splice-ocean dark:text-splice-water">{c.py}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-splice-blue">Only club admins can edit fleet settings.</p>
        </main>
      </div>
    );
  }

  const initialClassFlag = classFlagDisp;

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-3xl rounded-xl border border-splice-sky bg-white p-8 shadow-sm dark:border-splice-navy-light dark:bg-splice-navy">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link href={`/groups/${groupId}/fleets`} className="text-splice-blue hover:underline dark:text-splice-water">
            ← Club fleets
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold text-splice-navy dark:text-splice-surface">Maintain fleet</h1>

        {saved ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Fleet saved.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
            {error}
          </p>
        ) : null}

        <form action={updateGroupFleetAction} className="mt-6 flex flex-col gap-6">
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="fleet_id" value={fleetId} />
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Fleet name
            <input
              name="name"
              type="text"
              required
              defaultValue={fleet.name}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-splice-ocean dark:text-splice-water">
            Description <span className="font-normal text-splice-blue">(optional)</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={fleet.description ?? ""}
              className="rounded-lg border border-splice-water bg-white px-3 py-2 text-splice-navy outline-none ring-splice-blue focus:ring-2 dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam"
            />
          </label>

          <FleetClassPicker
            key={fleetId}
            catalog={fleetCatalog}
            initialSelectedKeys={selectedKeys}
            initialClassFlag={initialClassFlag}
          />

          <button
            type="submit"
            className="rounded-lg bg-splice-navy px-4 py-2.5 text-sm font-medium text-white transition hover:bg-splice-navy-light dark:bg-splice-foam dark:text-splice-navy dark:hover:bg-splice-sky"
          >
            Save
          </button>
        </form>

        <form action={deleteGroupFleetAction} className="mt-8 border-t border-splice-foam pt-6 dark:border-splice-navy-light">
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="fleet_id" value={fleetId} />
          <button
            type="submit"
            className="text-sm font-medium text-red-700 underline-offset-4 hover:underline dark:text-red-400"
          >
            Delete fleet
          </button>
        </form>
      </main>
    </div>
  );
}
