/**
 * SVG assets served from /public/marine-signal-flags/
 * Source: https://github.com/dzangolab/marine-signal-flags/tree/master/src/flags
 */

export const MARINE_SIGNAL_FLAG_BASE = "/marine-signal-flags";

export function marineFlagPublicSrc(flagKey: string): string {
  return `${MARINE_SIGNAL_FLAG_BASE}/${flagKey.toLowerCase()}.svg`;
}

/** Single-letter/number pennant for display when no SVG applies. */
export function pennantCharForDisplay(icsSignal: string | null, fleetName: string): string {
  const s = (icsSignal ?? "").trim();
  if (/^[A-Za-z0-9]/.test(s)) return s[0]!.toUpperCase();
  const n = fleetName.trim();
  if (/^[A-Za-z0-9]/.test(n)) return n[0]!.toUpperCase();
  return "?";
}

/** Lowercase a–z / 0–9 key for a stocked marine signal SVG, or null. */
export function marineFlagKeyFromIcsAndName(icsSignal: string | null, fleetName: string): string | null {
  const s = (icsSignal ?? "").trim();
  let raw: string;
  if (/^[A-Za-z0-9]/.test(s)) raw = s[0]!;
  else {
    const n = fleetName.trim();
    if (/^[A-Za-z0-9]/.test(n)) raw = n[0]!;
    else return null;
  }
  const k = raw.toLowerCase();
  return /^[a-z0-9]$/.test(k) ? k : null;
}

/** First code letter/digit for ICS option rows (e.g. ap → a). */
export function marineFlagKeyFromIcsOptionCode(code: string): string | null {
  const s = String(code ?? "").trim();
  if (!/^[A-Za-z0-9]/.test(s)) return null;
  const k = s[0]!.toLowerCase();
  return /^[a-z0-9]$/.test(k) ? k : null;
}

/** Group fleet `class_flag` single character → SVG key, or null. */
export function marineFlagKeyFromClassFlag(classFlag: string | null | undefined): string | null {
  const s = String(classFlag ?? "").trim();
  if (!s.length) return null;
  const k = s[0]!.toLowerCase();
  return /^[a-z0-9]$/.test(k) ? k : null;
}
