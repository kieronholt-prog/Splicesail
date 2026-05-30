"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { DEFAULT_MAP_CENTER } from "@/lib/sailing-analysis/map-display";

export type EditPoint = {
  /** Stable id used to match markers across renders (e.g. "A", "B"). */
  id: string;
  lat: number;
  lon: number;
  label: string;
  color: string;
};

export type MarkEditMapProps = {
  points: EditPoint[];
  /** Called continuously while dragging and once on drop. */
  onPointMove: (id: string, lat: number, lon: number) => void;
  className?: string;
};

const LINE_ID = "mark-edit-line";

/**
 * Focused editing map: centres on the mark(s) and lets the admin drag each
 * marker to reposition it. Dragging reports new lat/lon to the parent so the
 * number inputs stay in sync; the parent feeding new `points` back moves the
 * marker, giving two-way binding between the map and the lat/lon fields.
 */
export function MarkEditMap({ points, onPointMove, className }: MarkEditMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const onMoveRef = useRef(onPointMove);
  const draggingRef = useRef<string | null>(null);
  const fittedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);

  onMoveRef.current = onPointMove;

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const first = points[0];
    const center: [number, number] = first ? [first.lon, first.lat] : DEFAULT_MAP_CENTER;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center,
      zoom: 16,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setLoaded(true));

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.id);
      const existing = markersRef.current.get(p.id);
      if (existing) {
        const el = existing.getElement();
        el.textContent = p.label;
        // Don't yank the marker we're actively dragging back to a prop value.
        if (draggingRef.current !== p.id) existing.setLngLat([p.lon, p.lat]);
        continue;
      }

      const el = document.createElement("div");
      el.style.cssText = `width:26px;height:26px;border-radius:50%;border:3px solid ${p.color};background:#0a101fcc;color:${p.color};display:flex;align-items:center;justify-content:center;font:700 9px ui-monospace,monospace;cursor:grab;box-shadow:0 0 0 2px #00000055;`;
      el.textContent = p.label;
      const marker = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([p.lon, p.lat])
        .addTo(map);
      const report = () => {
        const ll = marker.getLngLat();
        onMoveRef.current(p.id, ll.lat, ll.lng);
      };
      marker.on("dragstart", () => {
        draggingRef.current = p.id;
        el.style.cursor = "grabbing";
      });
      marker.on("drag", report);
      marker.on("dragend", () => {
        draggingRef.current = null;
        el.style.cursor = "grab";
        report();
      });
      markersRef.current.set(p.id, marker);
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (points.length >= 2) {
      const fc = {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: points.map((p) => [p.lon, p.lat]),
        },
        properties: {},
      };
      const src = map.getSource(LINE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(fc);
      else {
        map.addSource(LINE_ID, { type: "geojson", data: fc });
        map.addLayer({
          id: `${LINE_ID}-glow`,
          type: "line",
          source: LINE_ID,
          paint: { "line-color": "#00e5c5", "line-width": 10, "line-opacity": 0.28, "line-blur": 3 },
        });
        map.addLayer({
          id: LINE_ID,
          type: "line",
          source: LINE_ID,
          paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 1, "line-dasharray": [2, 1.5] },
        });
      }
    } else {
      if (map.getLayer(LINE_ID)) map.removeLayer(LINE_ID);
      if (map.getLayer(`${LINE_ID}-glow`)) map.removeLayer(`${LINE_ID}-glow`);
      if (map.getSource(LINE_ID)) map.removeSource(LINE_ID);
    }

    if (!fittedRef.current && points.length > 0) {
      fittedRef.current = true;
      if (points.length >= 2) {
        const lats = points.map((p) => p.lat);
        const lons = points.map((p) => p.lon);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 90, maxZoom: 17, duration: 0 },
        );
      } else {
        map.setCenter([points[0].lon, points[0].lat]);
      }
    }
  }, [points, loaded]);

  if (!token) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-splice-sky px-4 py-8 text-center text-sm text-splice-ocean dark:border-splice-ocean dark:text-splice-water ${className ?? ""}`}
      >
        Add <code className="mx-1 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> to position marks on a map.
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border border-splice-sky dark:border-splice-ocean ${className ?? ""}`}>
      <div ref={containerRef} className="h-[min(360px,42vh)] w-full" />
    </div>
  );
}
