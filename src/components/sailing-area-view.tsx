"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { DEFAULT_MAP_CENTER } from "@/lib/sailing-analysis/map-display";
import {
  SailingMarksSection,
  markDisplayProps,
  PILE_BUOY_RE,
  type SailingMarkVm,
} from "@/components/sailing-area-marks-section";
import {
  CourseDetailPanel,
  AddCourseForm,
  courseToEntries,
  TACK_COLOR,
  COURSE_TYPE_LABEL,
} from "@/components/sailing-area-courses-section";
import type { SailingCourseRow } from "@/lib/sailing-analysis/types";

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

// ─── Unified sailing area map ─────────────────────────────────────────────────
// Merges the logic from the former MarksOverviewMap (all-marks mode) and
// CoursePreviewMap (course mode) into one persistent Mapbox instance.

function SailingAreaMap({
  marks,
  courses,
  selectedCourseId,
}: {
  marks: SailingMarkVm[];
  courses: SailingCourseRow[];
  selectedCourseId: string | null;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loaded, setLoaded] = useState(false);

  const byName = useMemo(() => new Map(marks.map((m) => [m.name, m])), [marks]);

  // Mount once
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
    map.on("load", () => setLoaded(true));
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, [token]);

  // Re-draw whenever selection, marks, or courses change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Clear previous layers/sources
    for (const id of [`${SF_LINE_ID}-glow`, SF_LINE_ID, `${COURSE_LINE_ID}-glow`, COURSE_LINE_ID]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of [SF_LINE_ID, COURSE_LINE_ID]) {
      if (map.getSource(id)) map.removeSource(id);
    }

    const lats: number[] = [];
    const lons: number[] = [];

    if (selectedCourseId === null) {
      // ── All-marks mode (ported from MarksOverviewMap) ────────────────────
      for (const m of marks) {
        const { color, label } = markDisplayProps(m);
        lats.push(m.lat);
        lons.push(m.lon);

        const elA = document.createElement("div");
        elA.title = m.name;
        elA.style.cssText = `width:26px;height:26px;border-radius:50%;border:3px solid ${color};background:#0a101fcc;color:${color};display:flex;align-items:center;justify-content:center;font:700 9px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055;cursor:default;`;
        elA.textContent = label;
        const markerA = new mapboxgl.Marker({ element: elA })
          .setLngLat([m.lon, m.lat])
          .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(m.name))
          .addTo(map);
        markersRef.current.push(markerA);

        if (m.mark_kind === "start_finish" && m.lat2 != null && m.lon2 != null) {
          lats.push(m.lat2);
          lons.push(m.lon2);
          const elB = document.createElement("div");
          elB.title = `${m.name} (end B)`;
          elB.style.cssText = `width:20px;height:20px;border-radius:50%;border:3px solid ${color};background:#0a101fcc;color:${color};display:flex;align-items:center;justify-content:center;font:700 8px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055;cursor:default;`;
          elB.textContent = "B";
          const markerB = new mapboxgl.Marker({ element: elB })
            .setLngLat([m.lon2, m.lat2])
            .addTo(map);
          markersRef.current.push(markerB);
        }
      }

      // Start/finish lines
      const sfLines = marks.filter(
        (m) => m.mark_kind === "start_finish" && m.lat2 != null && m.lon2 != null,
      );
      if (sfLines.length > 0) {
        const features = sfLines.map((m) => ({
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: [[m.lon, m.lat], [m.lon2!, m.lat2!]],
          },
          properties: {},
        }));
        map.addSource(SF_LINE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features },
        });
        map.addLayer({
          id: `${SF_LINE_ID}-glow`,
          type: "line",
          source: SF_LINE_ID,
          paint: { "line-color": "#3b82f6", "line-width": 10, "line-opacity": 0.28, "line-blur": 3 },
        });
        map.addLayer({
          id: SF_LINE_ID,
          type: "line",
          source: SF_LINE_ID,
          paint: {
            "line-color": "#ffffff",
            "line-width": 3,
            "line-opacity": 1,
            "line-dasharray": [2, 1.5],
          },
        });
      }
    } else {
      // ── Course mode ───────────────────────────────────────────────────────
      const course = courses.find((c) => c.id === selectedCourseId);
      if (!course) return;

      // S/F mark for this club — used as route start/end regardless of sequence
      const sfMark = marks.find((m) => m.mark_kind === "start_finish");
      const sfCenter =
        sfMark && sfMark.lat2 != null && sfMark.lon2 != null
          ? { lat: (sfMark.lat + sfMark.lat2) / 2, lon: (sfMark.lon + sfMark.lon2) / 2 }
          : sfMark
          ? { lat: sfMark.lat, lon: sfMark.lon }
          : null;

      // Always draw the S/F line (end A + B + connecting line) in course mode
      if (sfMark && sfMark.lat2 != null && sfMark.lon2 != null) {
        for (const [lng, lat, label, title] of [
          [sfMark.lon,  sfMark.lat,  "A", `${sfMark.name} — end A`],
          [sfMark.lon2, sfMark.lat2, "B", `${sfMark.name} — end B`],
        ] as [number, number, string, string][]) {
          lats.push(lat); lons.push(lng);
          const el = document.createElement("div");
          el.title = title;
          el.style.cssText = `width:22px;height:22px;border-radius:50%;border:3px solid #3b82f6;background:#0a101fcc;color:#3b82f6;display:flex;align-items:center;justify-content:center;font:700 8px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055;cursor:default;`;
          el.textContent = label;
          const m = new mapboxgl.Marker({ element: el })
            .setLngLat([lng, lat])
            .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(title))
            .addTo(map);
          markersRef.current.push(m);
        }
        map.addSource(SF_LINE_ID, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[sfMark.lon, sfMark.lat], [sfMark.lon2, sfMark.lat2]] },
            properties: {},
          },
        });
        map.addLayer({ id: `${SF_LINE_ID}-glow`, type: "line", source: SF_LINE_ID, paint: { "line-color": "#3b82f6", "line-width": 10, "line-opacity": 0.28, "line-blur": 3 } });
        map.addLayer({ id: SF_LINE_ID, type: "line", source: SF_LINE_ID, paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 1, "line-dasharray": [2, 1.5] } });
      }

      // Explicit S/F center marker so the route start/end is clearly visible
      if (sfCenter) {
        lats.push(sfCenter.lat); lons.push(sfCenter.lon);
        const elSF = document.createElement("div");
        elSF.title = sfMark?.name ?? "Start / Finish";
        elSF.style.cssText = `width:32px;height:32px;border-radius:50%;border:3px solid #3b82f6;background:#0a101fcc;color:#3b82f6;display:flex;align-items:center;justify-content:center;font:700 8px ui-monospace,monospace;box-shadow:0 0 0 2px #00000055,0 0 0 5px #3b82f622;cursor:default;`;
        elSF.textContent = "S/F";
        const markerSF = new mapboxgl.Marker({ element: elSF })
          .setLngLat([sfCenter.lon, sfCenter.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setText("Start / Finish"))
          .addTo(map);
        markersRef.current.push(markerSF);
      }

      // Resolve all course entries (preamble + sequence) against club marks
      const entries = courseToEntries(course);
      const resolved = entries
        .map((e) => ({ ...e, mark: byName.get(e.name) ?? null }))
        .filter((e): e is typeof e & { mark: SailingMarkVm } => e.mark !== null);

      // Numbered markers for each course mark (preamble marks shown dimmed)
      resolved.forEach(({ name, tack, firstLapOnly, mark }, i) => {
        const color = TACK_COLOR[tack];
        lats.push(mark.lat); lons.push(mark.lon);
        const el = document.createElement("div");
        el.title = name;
        el.style.cssText = [
          `width:26px;height:26px;border-radius:50%;`,
          `border:3px solid ${color};background:#0a101fcc;color:${color};`,
          `display:flex;align-items:center;justify-content:center;`,
          `font:700 9px ui-monospace,monospace;`,
          `box-shadow:0 0 0 2px #00000055;cursor:default;`,
          firstLapOnly ? "opacity:0.65;" : "",
        ].join("");
        el.textContent = String(i + 1);
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([mark.lon, mark.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(
              `${i + 1}. ${name} — ${tack === "P" ? "Port" : "Starboard"}${firstLapOnly ? " (1st lap)" : ""}`,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      });

      // Course line:
      //  - Always starts at sfCenter (1st leg)
      //  - preamble marks → sequence marks
      //  - If cross_sf_each_lap: closes at sfCenter (each lap ends at the line)
      //  - Otherwise: closes at first sequence mark (laps loop without crossing the line)
      const seqResolved = resolved.filter((e) => !e.firstLapOnly);
      const routeCoords: [number, number][] = [];
      if (sfCenter) routeCoords.push([sfCenter.lon, sfCenter.lat]);
      routeCoords.push(...resolved.map((e) => [e.mark.lon, e.mark.lat] as [number, number]));
      const crossSfEachLap = (course as { cross_sf_each_lap?: boolean }).cross_sf_each_lap ?? false;
      if (crossSfEachLap) {
        if (sfCenter) routeCoords.push([sfCenter.lon, sfCenter.lat]);
      } else if (seqResolved.length > 0) {
        // Close lap: last mark → first sequence mark (without crossing S/F)
        routeCoords.push([seqResolved[0].mark.lon, seqResolved[0].mark.lat]);
      }

      if (routeCoords.length >= 2) {
        map.addSource(COURSE_LINE_ID, {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: routeCoords }, properties: {} },
        });
        map.addLayer({ id: `${COURSE_LINE_ID}-glow`, type: "line", source: COURSE_LINE_ID, paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.12 } });
        map.addLayer({ id: COURSE_LINE_ID, type: "line", source: COURSE_LINE_ID, paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.65, "line-dasharray": [3, 2] } });
      }
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
  }, [loaded, selectedCourseId, marks, courses, byName]);

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
}: {
  groupId: string;
  marks: SailingMarkVm[];
  courses: SailingCourseRow[];
}) {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [addingCourse, setAddingCourse] = useState(false);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? null;

  // If the selected course was just removed, fall back to All Marks
  useEffect(() => {
    if (selectedCourseId && !courses.find((c) => c.id === selectedCourseId)) {
      setSelectedCourseId(null);
    }
  }, [courses, selectedCourseId]);

  const pillBase =
    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap";
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
      <SailingAreaMap marks={marks} courses={courses} selectedCourseId={selectedCourseId} />

      {/* Selector row: All Marks · course letters · Add course */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
        <CourseDetailPanel course={selectedCourse} allMarks={marks} groupId={groupId} />
      ) : (
        <SailingMarksSection groupId={groupId} marks={marks} />
      )}
    </section>
  );
}
