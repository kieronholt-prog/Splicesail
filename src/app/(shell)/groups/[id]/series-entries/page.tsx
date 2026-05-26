import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    series_entered?: string;
    withdrawn?: string;
  }>;
};

/** Legacy URL — series schedule & entries now live on My Entries. */
export default async function GroupSeriesEntriesPage({ params, searchParams }: Props) {
  const { id: groupId } = await params;
  const q = await searchParams;

  const qp = new URLSearchParams();
  if (q.error) qp.set("error", q.error);
  if (q.series_entered === "1") qp.set("series_entered", "1");
  if (q.withdrawn === "1") qp.set("withdrawn", "1");

  const qs = qp.toString();
  redirect(qs ? `/groups?${qs}#club-${groupId}` : `/groups#club-${groupId}`);
}
