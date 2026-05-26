import { redirect } from "next/navigation";

/** Series entry is on each club page under "Series". */
export default function EnterSeriesPage() {
  redirect("/groups");
}
