"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  buildTrackSegmentFeatureCollection,
  manoeuvreBadgeBaseColor,
  mapboxTrackLineColorByKindExpr,
} from "@/lib/sailing-analysis";
import { DEFAULT_MAP_CENTER, markBadgeLabel, type MapMarkDisplay } from "@/lib/sailing-analysis/map-display";
import type { MapManoeuvres } from "@/lib/sailing-analysis/analysis-types";
import type { FleetTrackOverlay } from "@/lib/sailing-analysis/load-race-fleet-tracks";
import { MapSetupLegend } from "@/components/sailing-analysis/map-setup-legend";

const TRK = "#00d4aa";
const TRK_ROUND = "#ff9500";
const MAP_RND_BISECTOR = "#a855f7";

function lineLayerBeforeLabels(map: mapboxgl.Map): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers) return undefined;
  return layers.find((l) => l.type === "symbol")?.id;
}

export type CourseAnalysisMapProps = {
  marks: Record<string, MapMarkDisplay>;
  trackPoints: { lat: number; lon: number; time?: number | null }[];
  courseLine: { lat: number; lon: number }[];
  onMarkDrag?: (name: string, lat: number, lon: number) => void;
  draggableAllMarks?: boolean;
  startFinishLine?: { endA: { lat: number; lon: number }; endB: { lat: number; lon: number } } | null;
  trackSegmentFC?: GeoJSON.FeatureCollection | { type: string; features: unknown[] } | null;
  legGatesFC?: GeoJSON.FeatureCollection | { type: string; features: unknown[] } | null;
  showMarkGates?: boolean;
  manoeuvres?: MapManoeuvres | null;
  fleetTracks?: FleetTrackOverlay[];
  showLegend?: boolean;
  className?: string;
};

export function CourseAnalysisMap({
  marks,
  trackPoints,
  courseLine,
  onMarkDrag,
  draggableAllMarks = true,
  startFinishLine,
  trackSegmentFC,
  legGatesFC,
  showMarkGates = false,
  manoeuvres,
  fleetTracks = [],
  showLegend = false,
  className,
}: CourseAnalysisMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const manMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const onMarkDragRef = useRef(onMarkDrag);
  const [mapLoaded, setMapLoaded] = useState(false);

  onMarkDragRef.current = onMarkDrag;

  const trackPaintColor = useMemo(
    () => mapboxTrackLineColorByKindExpr(TRK, TRK_ROUND) as mapboxgl.Expression,
    [],
  );

  const fallbackTrackFc = useMemo(() => {
    if (trackPoints.length < 2) return null;
    return buildTrackSegmentFeatureCollection(trackPoints, new Array(trackPoints.length).fill(false));
  }, [trackPoints]);

  const activeTrackFc = trackSegmentFC?.features?.length ? trackSegmentFC : fallbackTrackFc;

  useEffect(() => {
    if (!token || !mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: DEFAULT_MAP_CENTER,
      zoom: 13,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    map.on("load", () => {
      setMapLoaded(true);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      manMarkersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      manMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const allPts: { lat: number; lon: number }[] = [...trackPoints];
    for (const ft of fleetTracks) allPts.push(...ft.points);

    if (allPts.length > 1) {
      const lats = allPts.map((p) => p.lat);
      const lons = allPts.map((p) => p.lon);
      map.fitBounds(
        [
          [Math.min(...lons) - 0.005, Math.min(...lats) - 0.003],
          [Math.max(...lons) + 0.005, Math.max(...lats) + 0.003],
        ],
        { padding: 48, maxZoom: 15, duration: 0 },
      );
      return;
    }

    const entries = Object.values(marks);
    if (entries.length > 0) {
      const lats = entries.map((m) => m.lat);
      const lons = entries.map((m) => m.lon);
      map.fitBounds(
        [
          [Math.min(...lons) - 0.008, Math.min(...lats) - 0.005],
          [Math.max(...lons) + 0.008, Math.max(...lats) + 0.005],
        ],
        { padding: 48, maxZoom: 14, duration: 0 },
      );
    }
  }, [mapLoaded, trackPoints, fleetTracks, marks]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (activeTrackFc && trackPoints.length > 1) {
      const src = map.getSource("track-segments") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(activeTrackFc as GeoJSON.FeatureCollection);
      else {
        map.addSource("track-segments", { type: "geojson", data: activeTrackFc as GeoJSON.FeatureCollection });
        map.addLayer({
          id: "track-line",
          type: "line",
          source: "track-segments",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": trackPaintColor, "line-width": 3, "line-opacity": 0.88 },
        });
        map.addSource("track-points", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: trackPoints.map((p, idx) => ({
              type: "Feature",
              properties: { idx },
              geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            })),
          },
        });
        map.addLayer({
          id: "track-points",
          type: "circle",
          source: "track-points",
          paint: { "circle-radius": 1.8, "circle-color": "#d9fff7", "circle-opacity": 0.72 },
        });
      }
    }

    const courseCoords = courseLine.map((p) => [p.lon, p.lat]);
    if (courseCoords.length > 1) {
      const fc = {
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: courseCoords },
        properties: {},
      };
      const src = map.getSource("course") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(fc);
      else {
        map.addSource("course", { type: "geojson", data: fc });
        map.addLayer({
          id: "course-line",
          type: "line",
          source: "course",
          paint: {
            "line-color": "#ffb84a",
            "line-width": 2,
            "line-opacity": 0.65,
            "line-dasharray": [4, 3],
          },
        });
      }
    }

    const sf = startFinishLine;
    if (sf?.endA && sf?.endB) {
      const coords = [
        [sf.endA.lon, sf.endA.lat],
        [sf.endB.lon, sf.endB.lat],
      ];
      const geo = { type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: coords }, properties: {} };
      const src = map.getSource("sf-line") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(geo);
      else {
        map.addSource("sf-line", { type: "geojson", data: geo });
        map.addLayer({
          id: "sf-line-glow",
          type: "line",
          source: "sf-line",
          paint: { "line-color": "#00e5c5", "line-width": 10, "line-opacity": 0.28, "line-blur": 3 },
        });
        map.addLayer({
          id: "sf-line",
          type: "line",
          source: "sf-line",
          paint: {
            "line-color": "#ffffff",
            "line-width": 3.5,
            "line-opacity": 1,
            "line-dasharray": [2, 1.5],
          },
        });
      }
    }

    const gateSrc = map.getSource("leg-gates") as mapboxgl.GeoJSONSource | undefined;
    const emptyGates = { type: "FeatureCollection" as const, features: [] };
    if (gateSrc) {
      gateSrc.setData(showMarkGates && legGatesFC?.features?.length ? (legGatesFC as GeoJSON.FeatureCollection) : emptyGates);
    } else if (showMarkGates) {
      map.addSource("leg-gates", {
        type: "geojson",
        data: (legGatesFC?.features?.length ? legGatesFC : emptyGates) as GeoJSON.FeatureCollection,
      });
      map.addLayer({
        id: "leg-gate-rnd",
        type: "line",
        source: "leg-gates",
        filter: ["==", ["get", "kind"], "oneSided"],
        paint: {
          "line-color": MAP_RND_BISECTOR,
          "line-width": 2.4,
          "line-opacity": 0.92,
          "line-dasharray": [0.15, 0.15, 1, 0.15],
        },
      });
      map.addLayer({
        id: "leg-gate-txt",
        type: "symbol",
        source: "leg-gates",
        filter: ["==", ["get", "kind"], "gLbl"],
        layout: {
          "text-field": ["get", "tag"],
          "text-size": 9,
          "text-offset": [0, 0.75],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#f2ecff", "text-halo-color": "#0a1020", "text-halo-width": 1.2 },
      });
    }
  }, [
    activeTrackFc,
    courseLine,
    legGatesFC,
    mapLoaded,
    showMarkGates,
    startFinishLine,
    trackPaintColor,
    trackPoints,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    for (const ft of fleetTracks) {
      const srcId = `fleet-track-${ft.id}`;
      const layerId = `fleet-track-line-${ft.id}`;
      const coords = ft.points.map((p) => [p.lon, p.lat]);
      if (coords.length < 2) continue;
      const fc = {
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: coords },
        properties: { label: ft.label },
      };
      const src = map.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(fc);
      else {
        map.addSource(srcId, { type: "geojson", data: fc });
        map.addLayer(
          {
            id: layerId,
            type: "line",
            source: srcId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": ft.color, "line-width": 3.5, "line-opacity": 0.92 },
          },
          lineLayerBeforeLabels(map),
        );
      }
    }

    const activeIds = new Set(fleetTracks.map((f) => f.id));
    for (const layer of map.getStyle()?.layers ?? []) {
      const m = /^fleet-track-line-(.+)$/.exec(layer.id);
      if (m && !activeIds.has(m[1])) {
        try {
          map.removeLayer(layer.id);
          map.removeSource(`fleet-track-${m[1]}`);
        } catch {
          /* ignore */
        }
      }
    }
  }, [fleetTracks, mapLoaded]);

  const renderMark = useCallback(
    (name: string, mk: MapMarkDisplay) => {
      const draggable = draggableAllMarks ? true : !mk.fixed;
      const el = document.createElement("div");
      let border: string;
      let fg: string;
      let bg: string;
      if (mk.roundTack === "P") {
        border = "#ff4a6a";
        fg = "#fff";
        bg = "#ff4a6a38";
      } else if (mk.roundTack === "S") {
        border = "#4aff8a";
        fg = "#061018";
        bg = "#4aff8a45";
      } else if (name === "SFA" || name === "SFB") {
        border = "#00e5c5";
        fg = "#00e5c5";
        bg = "#111d33dd";
      } else {
        border = mk.fixed ? "#4a90d9" : "#e8b84a";
        fg = mk.fixed ? "#4a90d9" : "#e8b84a";
        bg = "#111d33dd";
      }
      el.style.cssText = `width:28px;height:28px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;font-size:8px;font-weight:700;font-family:ui-monospace,monospace;cursor:${draggable ? "grab" : "default"};border:2px solid ${border};background:${bg};color:${fg};`;
      const ab = document.createElement("span");
      ab.style.fontSize = "9px";
      ab.textContent = markBadgeLabel(name);
      el.appendChild(ab);
      if (mk.roundTack) {
        const tb = document.createElement("span");
        tb.style.fontSize = "7px";
        tb.textContent = mk.roundTack;
        el.appendChild(tb);
      }

      const marker = new mapboxgl.Marker({ element: el, draggable })
        .setLngLat([mk.lon, mk.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 12 }).setHTML(
            `<strong>${name}</strong>${mk.roundTack ? ` (${mk.roundTack === "P" ? "Port" : "Stbd"})` : ""}${draggable ? " — drag to adjust" : ""}${mk.description ? `<br/><span style="color:#8899b0">${mk.description}</span>` : ""}`,
          ),
        )
        .addTo(mapRef.current!);

      if (draggable && onMarkDragRef.current) {
        marker.on("dragend", () => {
          const lngLat = marker.getLngLat();
          onMarkDragRef.current!(name, lngLat.lat, lngLat.lng);
        });
      }
      return marker;
    },
    [draggableAllMarks],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const [name, mk] of Object.entries(marks)) {
      markersRef.current.push(renderMark(name, mk));
    }
  }, [marks, mapLoaded, renderMark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    manMarkersRef.current.forEach((m) => m.remove());
    manMarkersRef.current = [];
    if (!manoeuvres) return;

    const add = (m: (typeof manoeuvres.tacks)[0], title: string, color: string) => {
      const pointIdx = m.turnIdx ?? m.idx ?? 0;
      const lat = m.lat ?? trackPoints[pointIdx]?.lat;
      const lon = m.lon ?? trackPoints[pointIdx]?.lon;
      if (lat == null || lon == null) return;
      const el = document.createElement("div");
      el.style.cssText = `display:flex;align-items:center;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:800;font-family:ui-monospace,monospace;border:2px solid ${color};background:#0a101fcc;color:${color};pointer-events:none;`;
      el.textContent = title;
      manMarkersRef.current.push(
        new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lon, lat]).addTo(map),
      );
    };

    manoeuvres.tacks.forEach((m, i) => {
      const base = manoeuvreBadgeBaseColor(m);
      const col = m.excludeFromStatsAndVMG ? TRK_ROUND : base;
      add(m, m.excludeFromStatsAndVMG ? `T${i + 1}*` : `T${i + 1}`, col);
    });
    manoeuvres.gybes.forEach((m, i) => {
      const base = manoeuvreBadgeBaseColor(m);
      const col = m.excludeFromStatsAndVMG ? TRK_ROUND : base;
      add(m, m.excludeFromStatsAndVMG ? `G${i + 1}*` : `G${i + 1}`, col);
    });
  }, [manoeuvres, mapLoaded, trackPoints]);

  if (!token) {
    return (
      <div
        className={`rounded-xl border border-dashed border-splice-sky px-4 py-8 text-center text-sm text-splice-ocean dark:border-splice-ocean dark:text-splice-water ${className ?? ""}`}
      >
        Add <code className="text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> to show the course map.
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div className="overflow-hidden rounded-xl border border-splice-sky dark:border-splice-ocean">
        <div ref={mapContainer} className="h-[min(460px,58vh)] w-full" />
        <p className="border-t border-splice-sky bg-white px-3 py-2 text-xs text-splice-ocean dark:border-splice-ocean dark:bg-splice-navy dark:text-splice-water">
          Drag any mark or committee-line end (SFA/SFB) to match where they were on the water.
        </p>
      </div>
      {showLegend ? <MapSetupLegend /> : null}
      {fleetTracks.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-splice-ocean dark:text-splice-water">
          {fleetTracks.map((ft) => (
            <li key={ft.id} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 rounded" style={{ background: ft.color }} />
              {ft.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type { MapMarkDisplay };
