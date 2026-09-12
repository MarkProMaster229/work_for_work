import React, { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import NodePopup from "./NodePopup";

const COLORS = {
  edge:              "#3b82f6",
  client:            "#3b82f6",
  gateway:           "#f59e0b",
  satelliteActive:   "#ef4444",
  satelliteInactive: "#9ca3af",
  route:             "#f59e0b",
};

export default function MapView({
  geojson,
  routeGeojson,
  onLoaded,
  currentTime,
  onNodeOverride,
  onSelectClient,
  selectedClient,
  maxDuration = 86400,
  horizonS = 86400,           // ← добавлено
  routes = {},
  servingSatellites = {},
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const currentTimeRef = useRef(currentTime);
  const onNodeOverrideRef = useRef(onNodeOverride);
  const onSelectClientRef = useRef(onSelectClient);
  const maxDurationRef = useRef(maxDuration);
  const horizonRef = useRef(horizonS);
  const routesRef = useRef(routes);
  const servingRef = useRef(servingSatellites);
  const activePopupRef = useRef(null);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { onNodeOverrideRef.current = onNodeOverride; }, [onNodeOverride]);
  useEffect(() => { onSelectClientRef.current = onSelectClient; }, [onSelectClient]);
  useEffect(() => { maxDurationRef.current = maxDuration; }, [maxDuration]);
  useEffect(() => { horizonRef.current = horizonS; }, [horizonS]);
  useEffect(() => { routesRef.current = routes; }, [routes]);
  useEffect(() => { servingRef.current = servingSatellites; }, [servingSatellites]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [37.6173, 55.7558],
      zoom: 3,
      container: containerRef.current,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("graph-source", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addSource("route-source", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "graph-edges",
        type: "line",
        source: "graph-source",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": COLORS.edge,
          "line-width": 3,
          "line-opacity": 0.5,
        },
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-source",
        paint: {
          "line-color": COLORS.route,
          "line-width": 5,
          "line-opacity": 0.95,
        },
      });

      map.addLayer({
        id: "graph-nodes",
        type: "circle",
        source: "graph-source",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "node_type"], "ground_site"],
            ["case", ["==", ["get", "role"], "gateway"], 9, 7],
            ["==", ["get", "active"], true], 6,
            4,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "node_type"], "satellite"],
            [
              "case",
              ["==", ["get", "active"], true],
              COLORS.satelliteActive,
              COLORS.satelliteInactive,
            ],
            [
              "case",
              ["==", ["get", "role"], "gateway"],
              COLORS.gateway,
              COLORS.client,
            ],
          ],
          "circle-opacity": [
            "case",
            [
              "all",
              ["==", ["get", "node_type"], "satellite"],
              ["==", ["get", "active"], false],
            ],
            0.45,
            1,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", "graph-nodes", (e) => {
        const feature = e.features[0];
        const coordinates = feature.geometry.coordinates.slice();
        const node = {
          ...feature.properties,
          lat: coordinates[1],
          lon: coordinates[0],
          active:
            feature.properties.active === true ||
            feature.properties.active === "true",
        };

        if (node.node_type === "ground_site" && node.role === "client") {
          onSelectClientRef.current?.(node.node_id);
        }

        if (activePopupRef.current) {
          activePopupRef.current.root.unmount();
          activePopupRef.current.popup.remove();
          activePopupRef.current = null;
        }

        const container = document.createElement("div");
        const popup = new maplibregl.Popup({ offset: 12, maxWidth: "360px" })
          .setLngLat(coordinates)
          .setDOMContent(container)
          .addTo(map);

        const root = createRoot(container);
        const close = () => {
          root.unmount();
          popup.remove();
          if (activePopupRef.current?.popup === popup) {
            activePopupRef.current = null;
          }
        };

        root.render(
          <NodePopup
            node={node}
            currentTime={currentTimeRef.current}
            onApply={(o) => onNodeOverrideRef.current?.(o)}
            onClose={close}
            onSelectClient={onSelectClientRef.current}
            colors={COLORS}
            maxDuration={maxDurationRef.current}
            horizonS={horizonRef.current}
            routes={routesRef.current}
            servingSatellites={servingRef.current}
          />
        );

        activePopupRef.current = { popup, root };
        popup.on("close", () => {
          root.unmount();
          if (activePopupRef.current?.popup === popup) {
            activePopupRef.current = null;
          }
        });
      });

      map.on("mouseenter", "graph-nodes", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "graph-nodes", () => {
        map.getCanvas().style.cursor = "";
      });

      onLoaded?.();
    });

    map.on("error", (e) => console.error("MapLibre error:", e?.error || e));

    return () => {
      if (activePopupRef.current) {
        activePopupRef.current.root.unmount();
        activePopupRef.current.popup.remove();
        activePopupRef.current = null;
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const src = mapRef.current.getSource("graph-source");
    if (src) src.setData(geojson);
  }, [geojson]);

  useEffect(() => {
    if (!mapRef.current) return;
    const src = mapRef.current.getSource("route-source");
    if (src) {
      src.setData(routeGeojson || { type: "FeatureCollection", features: [] });
    }
  }, [routeGeojson]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "500px",
        borderRadius: 4,
        overflow: "hidden",
      }}
    />
  );
}