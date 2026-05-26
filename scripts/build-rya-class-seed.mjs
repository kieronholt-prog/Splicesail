#!/usr/bin/env node
/**
 * Reads data/rya_py_2026.csv (RYA-style columns) and prints a Supabase migration SQL
 * snippet: upsert public.boat_classes (metadata) + public.boat_class_pn (handicaps).
 *
 * Usage (from repo root):
 *   node scripts/build-rya-class-seed.mjs > supabase/migrations/TIMESTAMP_boat_classes_from_csv.sql
 *
 * CSV columns: Type, Category, No of crew, Rig, Spinnaker, Keel, Handicap
 * Optional 8th column "Engine" supported when present in header.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const csvPath = path.join(root, "data", "rya_py_2026.csv");

function normalizeBoatClassKey(className) {
  const t = String(className).trim().toLowerCase().replace(/\s+/g, " ");
  if (!t.length) return null;
  return t.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function sqlLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function parseLine(line, hasEngine) {
  const parts = line.split(",");
  const tail = hasEngine ? 7 : 6;
  if (parts.length < tail + 1) {
    throw new Error(`Expected at least ${tail + 1} columns: ${line}`);
  }
  const handicap = parseInt(parts[parts.length - 1], 10);
  const keel = parts[parts.length - 2];
  const spinnaker = parts[parts.length - 3];
  const rig = parts[parts.length - 4];
  const crewStr = parts[parts.length - 5];
  const category = parts[parts.length - 6];
  let typeParts;
  let engine = null;
  if (hasEngine) {
    engine = parts[parts.length - 7] || null;
    typeParts = parts.slice(0, parts.length - 7);
  } else {
    typeParts = parts.slice(0, parts.length - 6);
  }
  const type = typeParts.join(",").trim();
  const crewNum = parseInt(crewStr, 10);
  if (!Number.isFinite(handicap) || handicap < 400 || handicap > 2500) {
    throw new Error(`Bad handicap for ${type}: ${handicap}`);
  }
  if (!Number.isFinite(crewNum) || crewNum < 1 || crewNum > 20) {
    throw new Error(`Bad crew count for ${type}: ${crewStr}`);
  }
  const classKey = normalizeBoatClassKey(type);
  if (!classKey) throw new Error(`Empty class key for type: ${type}`);
  return {
    classKey,
    type,
    category: category.trim(),
    crewNum,
    rig: rig.trim(),
    spinnaker: spinnaker.trim(),
    keel: keel.trim(),
    engine: engine == null || engine === "" ? null : engine.trim(),
    handicap,
  };
}

const raw = fs.readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
if (lines.length < 2) throw new Error("CSV is empty");

const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
const hasEngine = header.includes("engine");
if (
  !header[0].includes("type") ||
  !header.includes("handicap") ||
  !header.includes("category")
) {
  throw new Error(`Unexpected header row: ${lines[0]}`);
}

const rows = [];
for (let i = 1; i < lines.length; i++) {
  rows.push(parseLine(lines[i], hasEngine));
}

const seen = new Set();
for (const r of rows) {
  if (seen.has(r.classKey)) throw new Error(`Duplicate class_key after normalize: ${r.classKey}`);
  seen.add(r.classKey);
}

console.log(`-- Generated from ${path.relative(root, csvPath)} — do not edit by hand; re-run script.
-- https://www.rya.org.uk — data © Royal Yachting Association (use per your licence).
-- Expects split schema: public.boat_classes (no py) + public.boat_class_pn (class_key, py).

insert into public.boat_classes (class_key, display_name, category, crew_count, rig, spinnaker, keel, engine, created_for_group_id)
values`);

const hullMetaLines = rows.map(
  (r) =>
    `  (${sqlLiteral(r.classKey)}, ${sqlLiteral(r.type)}, ${sqlLiteral(r.category)}, ${r.crewNum}, ${sqlLiteral(r.rig)}, ${sqlLiteral(r.spinnaker)}, ${sqlLiteral(r.keel)}, ${r.engine == null ? "null" : sqlLiteral(r.engine)}, null)`,
);
console.log(hullMetaLines.join(",\n"));
console.log(`on conflict (class_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  crew_count = excluded.crew_count,
  rig = excluded.rig,
  spinnaker = excluded.spinnaker,
  keel = excluded.keel,
  engine = excluded.engine;

insert into public.boat_class_pn (class_key, py)
values`);

const pnLines = rows.map((r) => `  (${sqlLiteral(r.classKey)}, ${r.handicap})`);
console.log(pnLines.join(",\n"));
console.log(`on conflict (class_key) do update set py = excluded.py;
`);
