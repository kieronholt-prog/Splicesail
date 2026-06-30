"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { DEFAULT_MAP_CENTER } from "@/lib/sailing-analysis/map-display";
import {
  SailingMarksSection,
  markDisplayProps,
  type SailingMarkVm,
} from "@/components/sailing-area-marks-section";
import {
  CourseDetailPanel,
  AddCourseForm,
  courseToEntries,
  entriesToPayload,
  TACK_COLOR,
  COURSE_TYPE_LABEL,
  type MarkEntry,
} from "@/components/sailing-area-courses-section";
import { isLineMark, type CourseMarkOverride, type SailingCourseRow } from "@/lib/sailing-analysis/types";

// ─── Legend data ──────────────────────────────────────────────────────────────

const ALL_MARKS_LEGEND = [
  { color: "#22c55e", label: "Channel Marker" },
  { color: "#ef4444", label: "Channel Marker" },
  { color: "#f97316", label: "Laid Mark" },
  { color: "#3b82f6", label: "Start / Finish Line" },
  { color: "#facc15", label: "Fixed Mark" },
] as const;

const COURSE_LEGEND = [
  { color: TACK_COLOR.S, label: "Starboard rounding" },
  { color: TACK_COLOR.P, label: "Port rounding" },
] as const;

// ─── Mapbox source/layer IDs ──────────────────────────────────────────────────

const SF_LINE_ID = "area-sf-lines";
const COURSE_LINE_ID = "area-course-line";
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function lineCenter(m: SailingMarkVm): { lat: number; lon: number } {
  return m.lat2 != null && m.lon2 != null
    ? { lat: (m.lat + m.lat2) / 2, lon: (m.lon + m.lon2) / 2 }
    : { lat: m.lat, lon: m.lon };
}

function markerEl(cssText: string, text: string, title: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = cssText;
  el.textContent = text;
  el.title = title;
  return el;
}

// ─── Unified sailing area map ─────────────────────────────────────────────────

function SailingAreaMap({
  marks,
  courses,
  selectedCourseId,
  editing,
  onMarkDragged,
}: {
  marks: SailingMarkVm[];
  courses: SailingCourseRow[];
  selectedCourseId: string | null;
  editing: boolean;
  onMarkDragged: (name: string, point: "A" | "B" | null, lat: number, lon: number) => void;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loaded, setLoaded] = useState(false);

  const byName = useMemo(() => new Map(marks.map((m) => [m.name, m])), [marks]);

  // Mount once — also set up persistent GeoJSON sources so we can use setData
  // later rather than removing and re-adding sources (which causes stale-course bugs).
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: DEFAULT_MAP_CENTER,
      zoom: 13,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      // Persistent sources — data is swapped via setData on every selection change.
      map.addSource(SF_LINE_ID, { type: "geojson", data: EMPTY_FC });
      map.addLayer({ id: `${SF_LINE_ID}-glow`, type: "line", source: SF_LINE_ID, paint: { "line-color": "#3b82f6", "line-width": 10, "line-opacity": 0.28, "line-blur": 3 } });
      map.addLayer({ id: SF_LINE_ID, type: "line", source: SF_LINE_ID, paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 1, "line-dasharray": [2, 1.5] } });

      map.addSource(COURSE_LINE_ID, { type: "geojson", data: EMPTY_FC });
      map.addLayer({ id: `${COURSE_LINE_ID}-glow`, type: "line", source: COURSE_LINE_ID, paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.12 } });
      map.addLayer({ id: COURSE_LINE_ID, type: "line", source: COURSE_LINE_ID, paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.65, "line-dasharray": [3, 2] } });

      setLoaded(true);
    });
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, [token]);

  // Re-draw whenever selection, marks, or courses change.
  // Sources already exist (added in init effect) — use setData to avoid the
  // remove/re-add cycle that caused stale courses appearing on different buttons.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const sfSrc = map.getSource(SF_LINE_ID) as mapboxgl.GeoJSONSource;
    const courseSrc = map.getSource(COURSE_LINE_ID) as mapboxgl.GeoJSONSource;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const lats: number[] = [];
    const lons: number[] = [];

    function addMarker(el: HTMLDivElement, lng: number, lat: number, popup: string) {
      lats.push(lat); lons.push(lng);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(popup))
        .addTo(map!);
      markersRef.current.push(marker);
    }

    if (selectedCourseId === null) {
      // ── All-marks mode ────────────────────────────────────────────────────
      for (const m of marks) {
        const { color, label } = markDisplayProps(m);
        addMarker(
          markerEl(`width:26px;height:26px;border-radius:50%;border:3px solid ${color};background:#0a101fcc;color:${color};display:flex;align-items:center;justify-content:center;font:700 9px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055;cursor:default;`, label, m.name),
          m.lon, m.lat, m.name,
        );
        if (isLineMark(m.mark_kind) && m.lat2 != null && m.lon2 != null) {
          addMarker(
            markerEl(`width:20px;height:20px;border-radius:50%;border:3px solid ${color};background:#0a101fcc;color:${color};display:flex;align-items:center;justify-content:center;font:700 8px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055;cursor:default;`, "B", `${m.name} (end B)`),
            m.lon2, m.lat2, `${m.name} — end B`,
          );
        }
      }

      // All line marks → SF_LINE_ID source
      const sfFeatures = marks
        .filter((m) => isLineMark(m.mark_kind) && m.lat2 != null && m.lon2 != null)
        .map((m) => ({
          type: "Feature" as const,
          geometry: { type: "LineString" as const, coordinates: [[m.lon, m.lat], [m.lon2!, m.lat2!]] },
          properties: {},
        }));
      sfSrc.setData({ type: "FeatureCollection", features: sfFeatures });
      courseSrc.setData(EMPTY_FC);

    } else {
      // ── Course mode ───────────────────────────────────────────────────────
      const course = courses.find((c) => c.id === selectedCourseId);
      if (!course) { sfSrc.setData(EMPTY_FC); courseSrc.setData(EMPTY_FC); return; }

      const courseOverrides: Record<string, CourseMarkOverride> = course.course_mark_overrides ?? {};

      // Resolve a mark name to a SailingMarkVm, applying course overrides.
      // Virtual marks (in overrides but not in the global catalogue) are synthesised here.
      function resolveMarkVm(name: string): SailingMarkVm | null {
        const ov = courseOverrides[name];
        const global = byName.get(name) ?? null;
        if (!global && !ov) return null;
        if (!global && ov) {
          return {
            id: `virtual-${name}`,
            name,
            mark_kind: (ov.mark_kind ?? "laid") as SailingMarkVm["mark_kind"],
            lat: ov.lat, lon: ov.lon,
            lat2: ov.lat2 ?? null, lon2: ov.lon2 ?? null,
            description: null,
          };
        }
        if (ov) return { ...global!, lat: ov.lat, lon: ov.lon, lat2: ov.lat2 ?? global!.lat2, lon2: ov.lon2 ?? global!.lon2 };
        return global;
      }

      // A mark is draggable in edit mode if it is a global laid mark or a virtual (course-local) mark.
      function isDraggable(name: string): boolean {
        if (!editing) return false;
        const isVirtual = !byName.has(name) && !!courseOverrides[name];
        const isLaid = byName.get(name)?.mark_kind === "laid";
        return isVirtual || isLaid;
      }

      // Resolve all course entries against club marks + overrides
      const markKindByName = new Map(
        marks.map((m) => [m.name, m.mark_kind] as [string, string]),
      );
      for (const [name, ov] of Object.entries(courseOverrides)) {
        if (ov.mark_kind) markKindByName.set(name, ov.mark_kind);
      }
      const entries = courseToEntries(course, markKindByName);
      const resolved = entries
        .map((e) => ({ ...e, mark: resolveMarkVm(e.name) }))
        .filter((e): e is typeof e & { mark: SailingMarkVm } => e.mark !== null);

      // Find the start and finish line marks for this course.
      // Prefer marks explicitly in the course sequence; fall back to club-level marks.
      const lineInCourse = resolved.filter((e) => isLineMark(e.mark.mark_kind));
      const startMark =
        lineInCourse.find((e) => e.mark.mark_kind === "start_finish" || e.mark.mark_kind === "start_line")?.mark
        ?? marks.find((m) => m.mark_kind === "start_finish" || m.mark_kind === "start_line");
      const finishMark =
        lineInCourse.findLast?.((e) => e.mark.mark_kind === "start_finish" || e.mark.mark_kind === "finish_line")?.mark
        ?? lineInCourse.find((e) => e.mark.mark_kind === "start_finish" || e.mark.mark_kind === "finish_line")?.mark
        ?? marks.find((m) => m.mark_kind === "start_finish" || m.mark_kind === "finish_line");

      const startCenter = startMark ? lineCenter(startMark) : null;
      const finishCenter = finishMark ? lineCenter(finishMark) : null;

      // Draw all line marks referenced by the course (A, B, and center S/F marker)
      const shownLineIds = new Set<string>();
      const sfLineFeatures: GeoJSON.Feature[] = [];

      for (const lm of lineInCourse) {
        if (shownLineIds.has(lm.mark.id)) continue;
        shownLineIds.add(lm.mark.id);
        const m = lm.mark;
        if (m.lat2 == null || m.lon2 == null) continue;

        const lineDraggable = isDraggable(m.name);
        const dragCursor = lineDraggable ? "cursor:grab;" : "cursor:default;";
        for (const [lng, lat, lbl, ttl, point] of [
          [m.lon,  m.lat,  "A", `${m.name} — end A`, "A"],
          [m.lon2, m.lat2, "B", `${m.name} — end B`, "B"],
        ] as [number, number, string, string, "A" | "B"][]) {
          const el = markerEl(`width:22px;height:22px;border-radius:50%;border:3px solid #3b82f6;background:#0a101fcc;color:#3b82f6;display:flex;align-items:center;justify-content:center;font:700 8px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055;${dragCursor}`, lbl, ttl);
          const mk = new mapboxgl.Marker({ element: el, draggable: lineDraggable })
            .setLngLat([lng, lat])
            .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(ttl))
            .addTo(map!);
          markersRef.current.push(mk);
          lats.push(lat); lons.push(lng);
          if (lineDraggable) {
            mk.on("dragend", () => {
              const ll = mk.getLngLat();
              onMarkDragged(m.name, point, ll.lat, ll.lng);
            });
          }
        }
        sfLineFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[m.lon, m.lat], [m.lon2, m.lat2]] }, properties: {} });
      }

      // If no line mark is in the course sequence, show the club's start mark
      if (shownLineIds.size === 0 && startMark && startMark.lat2 != null && startMark.lon2 != null) {
        for (const [lng, lat, lbl, ttl] of [
          [startMark.lon,  startMark.lat,  "A", `${startMark.name} — end A`],
          [startMark.lon2, startMark.lat2, "B", `${startMark.name} — end B`],
        ] as [number, number, string, string][]) {
          addMarker(
            markerEl(`width:22px;height:22px;border-radius:50%;border:3px solid #3b82f6;background:#0a101fcc;color:#3b82f6;display:flex;align-items:center;justify-content:center;font:700 8px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055;cursor:default;`, lbl, ttl),
            lng, lat, ttl,
          );
        }
        sfLineFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[startMark.lon, startMark.lat], [startMark.lon2, startMark.lat2]] }, properties: {} });
      }
      sfSrc.setData({ type: "FeatureCollection", features: sfLineFeatures });

      // S/F center marker (larger, glowing)
      if (startCenter) {
        addMarker(
          markerEl(`width:32px;height:32px;border-radius:50%;border:3px solid #3b82f6;background:#0a101fcc;color:#3b82f6;display:flex;align-items:center;justify-content:center;font:700 8px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055,0 0 0 5px #3b82f622;cursor:default;`, "S/F", startMark?.name ?? "Start / Finish"),
          startCenter.lon, startCenter.lat, "Start / Finish",
        );
      }

      // Rounding marks: labelled with All-Marks short labels, coloured by tack.
      // Laid marks and virtual (course-local) marks are draggable in edit mode.
      const roundingResolved = resolved.filter((e) => !isLineMark(e.mark.mark_kind));
      const seenRoundingNames = new Set<string>();
      roundingResolved.forEach(({ name, tack, partOfLap, mark }) => {
        // Only place one marker per unique name (same physical mark may appear multiple times).
        const alreadyPlaced = seenRoundingNames.has(name);
        seenRoundingNames.add(name);
        const color = TACK_COLOR[tack];
        const lbl = markDisplayProps(mark).label;
        const roundDraggable = isDraggable(name);
        const dragCursor = roundDraggable ? "cursor:grab;" : "cursor:default;";
        const el = markerEl([
          `width:26px;height:26px;border-radius:50%;`,
          `border:3px solid ${color};background:#0a101fcc;color:${color};`,
          `display:flex;align-items:center;justify-content:center;`,
          `font:700 9px ui-monospace,monospace;`,
          `box-shadow:0 0 0 2px #00000055;${dragCursor}`,
          partOfLap ? "" : "opacity:0.65;",
        ].join(""), lbl, name);
        const popup = `${name} — ${tack === "P" ? "Port" : "Starboard"}${partOfLap ? "" : " (once per race)"}`;
        if (!alreadyPlaced) {
          const mk = new mapboxgl.Marker({ element: el, draggable: roundDraggable })
            .setLngLat([mark.lon, mark.lat])
            .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(popup))
            .addTo(map!);
          markersRef.current.push(mk);
          lats.push(mark.lat); lons.push(mark.lon);
          if (roundDraggable) {
            mk.on("dragend", () => {
              const ll = mk.getLngLat();
              onMarkDragged(name, null, ll.lat, ll.lng);
            });
          }
        }
      });

      // Course line: startCenter → [preamble] → repeating marks → first repeating mark
      //             → finish center (only if finish line is in the course sequence)
      const startCoord: [number, number] | null = startCenter ? [startCenter.lon, startCenter.lat] : null;

      // Finish leg is drawn when the last mark in the course sequence is a line mark
      // (finish_line or start_finish). If the last mark is a rounding mark the finish
      // leg is suppressed — the app warns the user to add a finish line in that case.
      const lastResolved = resolved[resolved.length - 1] ?? null;
      const finishInSequence =
        lastResolved && isLineMark(lastResolved.mark.mark_kind) ? lastResolved.mark : null;
      const finishCoordInSequence: [number, number] | null = finishInSequence ? [lineCenter(finishInSequence).lon, lineCenter(finishInSequence).lat] : null;

      const seqRounding = roundingResolved.filter((e) => e.partOfLap);

      // Route depends on whether the course ends with a start_finish (circuit)
      // or a separate finish_line:
      //
      // start_finish circuit: start → [preamble] → marks → S/F (simple loop, no lap close)
      // finish_line course:   start → [preamble] → marks → first mark (lap close) [Feature 1]
      //                       + last mark → finish_line centre [Feature 2]
      // no finish in sequence: start → [preamble] → marks → first mark (circuit implied)
      const finishIsCircuit = finishInSequence?.mark_kind === "start_finish";
      const finishIsSeparate = finishInSequence?.mark_kind === "finish_line";

      const courseFeatures: GeoJSON.Feature[] = [];
      const circuitCoords: [number, number][] = [];
      if (startCoord) circuitCoords.push(startCoord);
      circuitCoords.push(...roundingResolved.map((e) => [e.mark.lon, e.mark.lat] as [number, number]));

      if (finishIsCircuit) {
        // Close the circuit back to S/F — no lap-close leg needed.
        if (startCoord) circuitCoords.push(startCoord);
      } else if (seqRounding.length > 0) {
        // Lap close: last repeating mark → first repeating mark.
        // Shows the circuit leg for multi-lap or finish_line courses.
        circuitCoords.push([seqRounding[0].mark.lon, seqRounding[0].mark.lat]);
      }

      if (circuitCoords.length >= 2) {
        courseFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: circuitCoords }, properties: {} });
      }

      // Separate finish leg only for explicit finish_line marks.
      if (finishIsSeparate && finishCoordInSequence) {
        const lastMark = seqRounding.length > 0
          ? ([seqRounding[seqRounding.length - 1].mark.lon, seqRounding[seqRounding.length - 1].mark.lat] as [number, number])
          : startCoord;
        if (lastMark) {
          courseFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: [lastMark, finishCoordInSequence] }, properties: {} });
        }
      }

      courseSrc.setData({ type: "FeatureCollection", features: courseFeatures });
    }

    // Fit/fly to visible marks whenever selection changes
    if (lats.length >= 2) {
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 60, maxZoom: 16, duration: 400 },
      );
    } else if (lats.length === 1) {
      map.flyTo({ center: [lons[0], lats[0]], zoom: 15, duration: 400 });
    }
  }, [loaded, selectedCourseId, marks, courses, byName, editing, onMarkDragged]);

  if (!token) return null;

  const inCourseMode = selectedCourseId !== null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-splice-sky dark:border-splice-ocean">
      <div ref={containerRef} className="h-[min(500px,55vh)] w-full" />
      <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-xs backdrop-blur-sm">
        {(inCourseMode ? COURSE_LEGEND : ALL_MARKS_LEGEND).map(({ color, label }, i) => (
          <span key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full border-2"
              style={{ borderColor: color, background: "#0a101fcc" }}
            />
            <span style={{ color }}>{label}</span>
          </span>
        ))}
        {!inCourseMode && (
          <span className="mt-1 border-t border-white/20 pt-1 italic text-white/50">
            Not to be used for Navigation
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main unified view ────────────────────────────────────────────────────────

export function SailingAreaView({
  groupId,
  marks,
  courses,
  initialCourseId,
}: {
  groupId: string;
  marks: SailingMarkVm[];
  courses: SailingCourseRow[];
  initialCourseId?: string;
}) {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    () => (initialCourseId && courses.some((c) => c.id === initialCourseId) ? initialCourseId : null),
  );
  const [addingCourse, setAddingCourse] = useState(false);
  const [liveEntries, setLiveEntries] = useState<MarkEntry[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [liveOverrides, setLiveOverrides] = useState<Record<string, CourseMarkOverride> | null>(null);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? null;

  // If the selected course was just removed, fall back to All Marks
  useEffect(() => {
    if (selectedCourseId && !courses.find((c) => c.id === selectedCourseId)) {
      setSelectedCourseId(null);
    }
  }, [courses, selectedCourseId]);

  // Reset live state whenever the selected course changes
  useEffect(() => {
    setLiveEntries(null);
    setLiveOverrides(null);
    setEditing(false);
  }, [selectedCourseId]);

  // Merge live editing state into the course passed to the map so it updates in real time.
  const mapCourses = useMemo(() => {
    if (!selectedCourseId) return courses;
    return courses.map((c) => {
      if (c.id !== selectedCourseId) return c;
      const { mark_sequence, marks_preamble } = liveEntries
        ? entriesToPayload(liveEntries)
        : { mark_sequence: c.mark_sequence, marks_preamble: c.marks_preamble };
      const course_mark_overrides = liveOverrides ?? c.course_mark_overrides ?? {};
      return { ...c, mark_sequence, marks_preamble, course_mark_overrides };
    });
  }, [courses, liveEntries, liveOverrides, selectedCourseId]);

  const handleMarkDragged = useCallback((name: string, point: "A" | "B" | null, lat: number, lon: number) => {
    setLiveOverrides((prev) => {
      const base = prev ?? selectedCourse?.course_mark_overrides ?? {};
      const existing = base[name] ?? {};
      const updated = point === "B"
        ? { ...existing, lat2: lat, lon2: lon }
        : { ...existing, lat, lon };
      return { ...base, [name]: updated };
    });
  }, [selectedCourse]);

  const pillBase =
    "rounded-full px-3 py-1 text-xs font-medium transition-colors";
  const pillActive =
    "bg-splice-navy text-white dark:bg-splice-foam dark:text-splice-navy";
  const pillInactive =
    "border border-splice-water text-splice-navy hover:border-splice-navy dark:border-splice-ocean dark:text-splice-foam dark:hover:border-splice-foam";

  function selectCourse(id: string | null) {
    setSelectedCourseId(id);
    setAddingCourse(false);
  }

  return (
    <section className="mt-10 space-y-4">
      {/* Single shared map */}
      <SailingAreaMap marks={marks} courses={mapCourses} selectedCourseId={selectedCourseId} editing={editing} onMarkDragged={handleMarkDragged} />

      {/* Selector row: All Marks · course letters · Add course */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => selectCourse(null)}
          className={`${pillBase} ${selectedCourseId === null && !addingCourse ? pillActive : pillInactive}`}
        >
          All Marks
        </button>

        {courses.map((c) => (
          <button
            key={c.id}
            type="button"
            title={`${COURSE_TYPE_LABEL[c.course_type] ?? c.course_type} — ${c.display_name}`}
            onClick={() => selectCourse(c.id)}
            className={`${pillBase} ${selectedCourseId === c.id ? pillActive : pillInactive}`}
          >
            {c.course_letter}
          </button>
        ))}

        <button
          type="button"
          onClick={() => { setAddingCourse((v) => !v); setSelectedCourseId(null); }}
          className={`${pillBase} ${addingCourse ? pillActive : pillInactive}`}
        >
          + Add course
        </button>
      </div>

      {/* Content area */}
      {addingCourse ? (
        <AddCourseForm groupId={groupId} onDone={() => setAddingCourse(false)} />
      ) : selectedCourse ? (
        <CourseDetailPanel
          key={selectedCourse.id}
          course={selectedCourse}
          allMarks={marks}
          groupId={groupId}
          editing={editing}
          onEditingChange={setEditing}
          overrides={liveOverrides ?? selectedCourse.course_mark_overrides ?? {}}
          onOverridesChange={setLiveOverrides}
          onEntriesChange={setLiveEntries}
        />
      ) : (
        <SailingMarksSection groupId={groupId} marks={marks} />
      )}
    </section>
  );
}
