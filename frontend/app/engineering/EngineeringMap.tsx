"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, { LngLatBoundsLike, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";

type ZoneFeature = {
  zone_id: string;
  zone_name: string;
  capacity_pct: number;
  centroid_lat: number;
  centroid_lng: number;
};

type PermitFeature = {
  permit_id: string;
  permit_type?: string;
  units: number;
  lat: number;
  lng: number;
};

type Props = {
  zones: ZoneFeature[];
  permits: PermitFeature[];
};

function zoneColor(capacity: number): [number, number, number, number] {
  if (capacity >= 90) return [255, 51, 102, 200];
  if (capacity >= 75) return [255, 184, 0, 180];
  return [0, 212, 255, 160];
}

export default function EngineeringMap({ zones, permits }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [viewMode, setViewMode] = useState<"subdivision" | "integrated">("subdivision");
  const [use3D, setUse3D] = useState(true);
  const hasFeatures = zones.length > 0 || permits.length > 0;

  const subdivisionPermits = permits.filter((p) => p.permit_type === "subdivision");
  const activePermits = viewMode === "subdivision" ? subdivisionPermits : permits;

  const getEffectiveCapacity = useCallback(
    (zone: ZoneFeature) => {
      if (viewMode === "integrated") return zone.capacity_pct;
      const infillInZone = permits.filter(
        (p) => p.permit_type === "infill" && zones.find((z) => z.zone_id === zone.zone_id)
      );
      const infillLoad = infillInZone.reduce((sum, p) => sum + p.units, 0);
      const totalUnits = permits
        .filter((p) => zones.find((z) => z.zone_id === zone.zone_id))
        .reduce((sum, p) => sum + p.units, 0);
      if (totalUnits === 0) return zone.capacity_pct;
      const infillFraction = infillLoad / Math.max(totalUnits, 1);
      const adjustedCapacity = zone.capacity_pct * (1 - infillFraction * 0.4);
      return Math.max(Math.round(adjustedCapacity), 30);
    },
    [viewMode, zones, permits]
  );

  // Create/update deck.gl layers
  const updateDeckLayers = useCallback(() => {
    if (!overlayRef.current) return;

    const effectiveZones = zones.map((z) => ({
      ...z,
      effective_capacity: getEffectiveCapacity(z),
    }));

    const layers = use3D
      ? [
          new ColumnLayer({
            id: "zone-columns",
            data: effectiveZones,
            getPosition: (d: (typeof effectiveZones)[0]) => [d.centroid_lng, d.centroid_lat],
            getElevation: (d: (typeof effectiveZones)[0]) => d.effective_capacity * 12,
            getFillColor: (d: (typeof effectiveZones)[0]) => zoneColor(d.effective_capacity),
            diskResolution: 20,
            radius: 200,
            extruded: true,
            elevationScale: 1,
            material: {
              ambient: 0.64,
              diffuse: 0.6,
              shininess: 32,
              specularColor: [51, 51, 51],
            },
            pickable: true,
            transitions: {
              getElevation: { duration: 800, easing: (t: number) => 1 - Math.pow(1 - t, 3) },
              getFillColor: { duration: 600 },
            },
          }),
          new ScatterplotLayer({
            id: "permit-scatter",
            data: activePermits,
            getPosition: (d: PermitFeature) => [d.lng, d.lat],
            getRadius: (d: PermitFeature) => 30 + d.units * 6,
            getFillColor: [0, 212, 255, 140],
            getLineColor: [0, 212, 255, 80],
            lineWidthMinPixels: 1,
            stroked: true,
            radiusMinPixels: 3,
            radiusMaxPixels: 12,
            pickable: true,
            transitions: {
              getRadius: { duration: 600 },
            },
          }),
        ]
      : [
          // 2D mode — just scatterplot for zones
          new ScatterplotLayer({
            id: "zone-circles",
            data: effectiveZones,
            getPosition: (d: (typeof effectiveZones)[0]) => [d.centroid_lng, d.centroid_lat],
            getRadius: (d: (typeof effectiveZones)[0]) =>
              180 + (d.effective_capacity / 100) * 220,
            getFillColor: (d: (typeof effectiveZones)[0]) => {
              const c = zoneColor(d.effective_capacity);
              return [c[0], c[1], c[2], 30] as [number, number, number, number];
            },
            getLineColor: (d: (typeof effectiveZones)[0]) => zoneColor(d.effective_capacity),
            lineWidthMinPixels: 2,
            stroked: true,
            pickable: true,
            transitions: {
              getRadius: { duration: 600 },
              getFillColor: { duration: 600 },
            },
          }),
          new ScatterplotLayer({
            id: "permit-scatter",
            data: activePermits,
            getPosition: (d: PermitFeature) => [d.lng, d.lat],
            getRadius: (d: PermitFeature) => 30 + d.units * 6,
            getFillColor: [0, 212, 255, 140],
            getLineColor: [0, 212, 255, 80],
            lineWidthMinPixels: 1,
            stroked: true,
            radiusMinPixels: 3,
            radiusMaxPixels: 12,
            pickable: true,
          }),
        ];

    overlayRef.current.setProps({ layers });
  }, [zones, permits, activePermits, getEffectiveCapacity, use3D]);

  useEffect(() => {
    if (!containerRef.current || !hasFeatures) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      overlayRef.current = null;
    }

    const allCoords = [
      ...zones.map((z) => [z.centroid_lng, z.centroid_lat]),
      ...permits.map((p) => [p.lng, p.lat]),
    ];
    const bounds = [
      [
        Math.min(...allCoords.map((c) => c[0])) - 0.012,
        Math.min(...allCoords.map((c) => c[1])) - 0.01,
      ],
      [
        Math.max(...allCoords.map((c) => c[0])) + 0.012,
        Math.max(...allCoords.map((c) => c[1])) + 0.01,
      ],
    ] satisfies LngLatBoundsLike;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      bounds,
      fitBoundsOptions: { padding: 36 },
      pitch: use3D ? 45 : 0,
      bearing: use3D ? -15 : 0,
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right"
    );

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    overlayRef.current = overlay;

    map.on("load", () => {
      map.addControl(overlay as unknown as maplibregl.IControl);

      // Add zone labels as a MapLibre symbol layer
      const effectiveZones = zones.map((z) => ({
        ...z,
        effective_capacity: getEffectiveCapacity(z),
      }));

      const zoneGeoJson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: effectiveZones.map((zone) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [zone.centroid_lng, zone.centroid_lat],
          },
          properties: {
            zone_name: zone.zone_name,
            capacity_pct: zone.effective_capacity,
          },
        })),
      };

      map.addSource("zone-labels-src", { type: "geojson", data: zoneGeoJson });
      map.addLayer({
        id: "zone-labels",
        type: "symbol",
        source: "zone-labels-src",
        layout: {
          "text-field": [
            "concat",
            ["get", "zone_name"],
            "\n",
            ["to-string", ["get", "capacity_pct"]],
            "%",
          ],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-anchor": "center",
          "text-line-height": 1.3,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#e8ecf4",
          "text-halo-color": "rgba(10, 10, 15, 0.85)",
          "text-halo-width": 2,
        },
      });

      updateDeckLayers();
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFeatures, zones, permits]);

  // Update deck layers when view mode or 3D toggle changes
  useEffect(() => {
    updateDeckLayers();

    // Also update label source
    if (mapRef.current?.getSource("zone-labels-src")) {
      const effectiveZones = zones.map((z) => ({
        ...z,
        effective_capacity: getEffectiveCapacity(z),
      }));
      const geoJson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: effectiveZones.map((zone) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [zone.centroid_lng, zone.centroid_lat],
          },
          properties: {
            zone_name: zone.zone_name,
            capacity_pct: zone.effective_capacity,
          },
        })),
      };
      (
        mapRef.current.getSource("zone-labels-src") as maplibregl.GeoJSONSource
      ).setData(geoJson);
    }

    // Animate pitch for 3D toggle
    if (mapRef.current) {
      mapRef.current.easeTo({
        pitch: use3D ? 45 : 0,
        bearing: use3D ? -15 : 0,
        duration: 800,
      });
    }
  }, [viewMode, use3D, updateDeckLayers, zones, getEffectiveCapacity]);

  if (!hasFeatures) {
    return (
      <div className="maplibreCanvas mapEmptyState" aria-label="Engineering basemap">
        No map layers selected for this workspace.
      </div>
    );
  }

  const effectiveZones = zones.map((z) => ({
    ...z,
    effective_capacity: getEffectiveCapacity(z),
  }));
  const criticalCount = effectiveZones.filter(
    (z) => z.effective_capacity >= 90
  ).length;

  return (
    <div>
      <div className="viewToggleBar" style={{ marginBottom: 10 }}>
        <span className="toggleLabel">Data view</span>
        <div className="viewToggle">
          <button
            type="button"
            className={viewMode === "subdivision" ? "active" : ""}
            onClick={() => setViewMode("subdivision")}
          >
            Subdivision only
          </button>
          <button
            type="button"
            className={viewMode === "integrated" ? "active" : ""}
            onClick={() => setViewMode("integrated")}
          >
            Integrated view
          </button>
        </div>
        <div className="viewToggle">
          <button
            type="button"
            className={use3D ? "active" : ""}
            onClick={() => setUse3D(true)}
          >
            3D
          </button>
          <button
            type="button"
            className={!use3D ? "active" : ""}
            onClick={() => setUse3D(false)}
          >
            2D
          </button>
        </div>
        {viewMode === "integrated" && criticalCount > 0 && (
          <span
            style={{
              color: "#FF3366",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              animation: "pulse-glow 2s ease-in-out infinite",
            }}
          >
            {criticalCount} zone{criticalCount > 1 ? "s" : ""} critical
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="maplibreCanvas"
        aria-label="Engineering basemap"
        style={{ height: 520 }}
      />
    </div>
  );
}
