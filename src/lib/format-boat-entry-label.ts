/** Sail number · boat type · boat name — Series entries and similar lists. */
export function formatBoatEntryLabel(parts: {
  defaultSailNumber?: string | null;
  className?: string | null;
  ryaClassKey?: string | null;
  label: string;
}): string {
  const sail = (parts.defaultSailNumber ?? "").trim() || "—";
  const boatType = (parts.className ?? "").trim() || (parts.ryaClassKey ?? "").trim() || "—";
  const name = parts.label.trim() || "—";
  return `${sail} · ${boatType} · ${name}`;
}
