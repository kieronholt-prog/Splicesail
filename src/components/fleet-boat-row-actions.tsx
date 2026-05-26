import Link from "next/link";
import { FleetRemoveBoatForm } from "@/components/fleet-remove-boat-form";

export function FleetBoatRowActions({ boatId }: { boatId: string }) {
  return (
    <div className="flex flex-nowrap items-center justify-end gap-2">
      <Link
        href={`/fleet/${boatId}`}
        className="inline-flex shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-splice-water bg-white px-3 py-1.5 text-xs font-medium text-splice-navy shadow-sm hover:bg-splice-surface dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-foam dark:hover:bg-splice-navy-light"
      >
        Edit boat
      </Link>
      <FleetRemoveBoatForm boatId={boatId} variant="row" />
    </div>
  );
}
