"use client";

import { useEffect, useRef } from "react";
import maplibregl, { GeoJSONSource, LngLatBoundsLike, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type ZoneFeature = {
  zone_id: string;
  zone_name: string;
  capacity_pct: number;
  centroid_lat: number;
  centroid_lng: number;
};

type PermitFeature = {
  permit_id: string;
  units: number;
  lat: number;
  lng: number;
};

type Props = {
  zones: ZoneFeature[];
  permits: PermitFeature[];
};

function zoneColor(capacity: number) {
  if (capacity >= 90) return "#b42318";
  if (capacity >= 75) return "#b88217";
  return "#2f6b52";
}

export default function EngineeringMap({ zones, permits }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const zoneGeoJson = {
      type: "FeatureCollection" as const,
      features: zones.map((zone) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [zone.centroid_lng, zone.centroid_lat],
        },
        properties: {
          zone_id: zone.zone_id,
          zone_name: zone.zone_name,
          capacity_pct: zone.capacity_pct,
          color: zoneColor(zone.capacity_pct),
          radius: 18 + (zone.capacity_pct / 100) * 22,
        },
      })),
    };

    const permitGeoJson = {
      type: "FeatureCollection" as const,
      features: permits.map((permit) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [permit.lng, permit.lat],
        },
        properties: {
          permit_id: permit.permit_id,
          units: permit.units,
          radius: 3 + permit.units / 10,
        },
      })),
    };

    const bounds = [
      [Math.min(...permits.map((permit) => permit.lng), ...zones.map((zone) => zone.centroid_lng)) - 0.01, Math.min(...permits.map((permit) => permit.lat), ...zones.map((zone) => zone.centroid_lat)) - 0.008],
      [Math.max(...permits.map((permit) => permit.lng), ...zones.map((zone) => zone.centroid_lng)) + 0.01, Math.max(...permits.map((permit) => permit.lat), ...zones.map((zone) => zone.centroid_lat)) + 0.008],
    ] satisfies LngLatBoundsLike;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
      bounds,
      fitBoundsOptions: { padding: 28 },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");

    map.on("load", () => {
      map.addSource("zones", {
        type: "geojson",
        data: zoneGeoJson,
      });
      map.addSource("permits", {
        type: "geojson",
        data: permitGeoJson,
      });

      map.addLayer({
        id: "zone-bubbles",
        type: "circle",
        source: "zones",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.12,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 1.8,
        },
      });

      map.addLayer({
        id: "permit-points",
        type: "circle",
        source: "permits",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": "#1d4ed8",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.4,
        },
      });

      map.addLayer({
        id: "zone-labels",
        type: "symbol",
        source: "zones",
        layout: {
          "text-field": ["slice", ["get", "zone_id"], 9, 11],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
        },
        paint: {
          "text-color": "#111111",
        },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [permits, zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      return;
    }
    (map.getSource("zones") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: zones.map((zone) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [zone.centroid_lng, zone.centroid_lat] },
        properties: {
          zone_id: zone.zone_id,
          zone_name: zone.zone_name,
          capacity_pct: zone.capacity_pct,
          color: zoneColor(zone.capacity_pct),
          radius: 18 + (zone.capacity_pct / 100) * 22,
        },
      })),
    });
    (map.getSource("permits") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: permits.map((permit) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [permit.lng, permit.lat] },
        properties: {
          permit_id: permit.permit_id,
          units: permit.units,
          radius: 3 + permit.units / 10,
        },
      })),
    });
  }, [permits, zones]);

  return <div ref={containerRef} className="maplibreCanvas" aria-label="Engineering basemap" />;
}
