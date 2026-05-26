import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { fetchRyaCatalogOptionsForGroup } from "@/lib/rya-catalog-scope";

function paddedPy(py: number): string {
  if (!Number.isFinite(py)) return "0000";
  return String(Math.round(py)).padStart(4, "0");
}

type FleetPyClassRow = { py: number; display_name: string };

function summarizeFleetHullClasses(classes: FleetPyClassRow[]): string {
  const rows = [...classes].sort(
    (a, b) => a.py - b.py || a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
  );
  if (rows.length === 0) return "No boat classes selected.";
  if (rows.length === 1) {
    const only = rows[0];
    return `${paddedPy(only.py)} ${only.display_name}`;
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  return `From ${paddedPy(first.py)} ${first.display_name} To ${paddedPy(last.py)} ${last.display_name}`;
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    fleet_deleted?: string;
    fleet_saved?: string;
  }>;
};

export default async function GroupFleetsListPage({ params, searchParams }: Props) {
  const { id: groupId } = await params;
  const q = await searchParams;
  const pageError = q.error ? decodeURIComponent(q.error) : null;
  const fleetSaved = q.fleet_saved === "1";
  const fleetDeleted = q.fleet_deleted === "1";

  const { supabase, user } = await getServerAuth();

  if (!user) redirect("/login");

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) notFound();

  const { data: me } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!me) {
    redirect("/groups");
  }

  const isAdmin = me.role === "club_admin";

  const [{ data: fleetRows }, catalogList] = await Promise.all([
    supabase
      .from("group_fleets")
      .select("id, name, sort_order, class_flag")
      .eq("group_id", groupId)
      .order("sort_order", { ascending: true }),
    fetchRyaCatalogOptionsForGroup(supabase, groupId),
  ]);

  const catalog = catalogList;
  const ryaByKey = new Map(catalog.map((r) => [r.class_key, r] as const));
  const fleetIdList = (fleetRows ?? []).map((f) => f.id);
  let fleetClassLinks: { fleet_id: string; class_key: string }[] = [];
  if (fleetIdList.length > 0) {
    const { data: linkRows } = await supabase
      .from("group_fleet_classes")
      .select("fleet_id, class_key")
      .in("fleet_id", fleetIdList);
    fleetClassLinks = linkRows ?? [];
  }

  const { data: clubPyRows } = await supabase.from("group_class_py").select("class_key, py").eq("group_id", groupId);
  const clubPyByKey = new Map((clubPyRows ?? []).map((r) => [r.class_key, Number(r.py)] as const));

  function fleetHullClassRows(fleetId: string): FleetPyClassRow[] {
    const keys = fleetClassLinks.filter((l) => l.fleet_id === fleetId).map((l) => l.class_key);
    const out: FleetPyClassRow[] = [];
    for (const class_key of keys) {
      const rya = ryaByKey.get(class_key);
      const py = clubPyByKey.has(class_key)
        ? clubPyByKey.get(class_key)!
        : rya?.py != null
          ? Number(rya.py)
          : NaN;
      const display_name = rya?.display_name ?? class_key;
      if (!Number.isFinite(py)) continue;
      out.push({ py, display_name });
    }
    return out;
  }

  return (
    <div className="flex flex-1 flex-col bg-splice-surface px-4 py-12 dark:bg-splice-navy">
      <main className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-splice-ocean dark:text-splice-water">
          <Link href={`/groups/${groupId}`} className="text-splice-blue hover:underline dark:text-splice-water">
            ← {group.name}
          </Link>
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-splice-navy dark:text-splice-surface">Club fleets</h1>
            <p className="mt-1 text-sm text-splice-ocean dark:text-splice-water">
              Named fleet groups for starts and organisation{isAdmin ? ". Create or maintain fleets here (also linked from Club admin settings)." : "."}
            </p>
          </div>
          {isAdmin ? (
            <Link
              href={`/groups/${groupId}/fleets/new`}
              className="inline-flex shrink-0 justify-center rounded-lg bg-splice-navy px-4 py-2 text-sm font-medium text-white dark:bg-splice-foam dark:text-splice-navy"
            >
              Create new fleet
            </Link>
          ) : null}
        </div>

        {fleetSaved ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Fleet saved.
          </p>
        ) : null}
        {fleetDeleted ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Fleet removed.
          </p>
        ) : null}
        {pageError ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
            {pageError}
          </p>
        ) : null}

        <section className="mt-10 rounded-xl border border-splice-sky bg-white p-6 dark:border-splice-navy-light dark:bg-splice-navy">
          {!fleetRows?.length ? (
            <p className="text-sm text-splice-ocean dark:text-splice-water">
              No fleets defined yet.
              {isAdmin ? (
                <>
                  {" "}
                  Use <strong className="font-medium text-splice-navy dark:text-splice-surface">Create new fleet</strong> above.
                </>
              ) : null}
            </p>
          ) : (
            <ul className="divide-y divide-splice-foam rounded-lg border border-splice-foam dark:divide-splice-navy-light dark:border-splice-navy-light">
              {(fleetRows ?? []).map((f) => (
                <li key={f.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-splice-navy dark:text-splice-foam">{f.name}</span>
                      {f.class_flag ? (
                        <span className="rounded bg-splice-foam px-1.5 py-0.5 font-mono text-xs text-splice-ocean dark:bg-splice-navy-light dark:text-splice-water">
                          flag {String(f.class_flag)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-splice-blue dark:text-splice-water">
                      {summarizeFleetHullClasses(fleetHullClassRows(f.id))}
                    </p>
                  </div>
                  {isAdmin ? (
                    <Link
                      href={`/groups/${groupId}/fleets/${f.id}`}
                      className="inline-flex justify-center rounded-lg border border-splice-water px-3 py-1.5 text-xs font-medium text-splice-navy dark:border-splice-ocean dark:text-splice-foam"
                    >
                      Maintain
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
