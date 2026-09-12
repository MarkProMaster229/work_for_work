import React, { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import NodePopup from "./NodePopup";

// Палитра — меняй здесь, если захочешь другие цвета.
const COLORS = {
  edge:              "#3b82f6", // линии связи
  client:            "#3b82f6", // ← КЛИЕНТ (синий)
  gateway:           "#f59e0b", // ← ШЛЮЗ (янтарный)
  satelliteActive:   "#ef4444", // спутник включён
  satelliteInactive: "#9ca3af", // спутник выключен
};

export default function MapView({
  geojson,
  onLoaded,
  currentTime,
  onNodeOverride,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const currentTimeRef = useRef(currentTime);
  const onNodeOverrideRef = useRef(onNodeOverride);
  const activePopupRef = useRef(null); // {popup, root}

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    onNodeOverrideRef.current = onNodeOverride;
  }, [onNodeOverride]);

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

      // ---------- Рёбра ----------
      map.addLayer({
        id: "graph-edges",
        type: "line",
        source: "graph-source",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": COLORS.edge,
          "line-width": 3,
          "line-opacity": 0.7,
        },
      });

      // ---------- Узлы ----------
      // Порядок разбора:
      //   1) satellite  → active ? красный : серый
      //   2) ground_site → role==gateway ? янтарный : синий
      map.addLayer({
        id: "graph-nodes",
        type: "circle",
        source: "graph-source",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": [
            "case",
            // наземные станции
            ["==", ["get", "node_type"], "ground_site"],
            ["case", ["==", ["get", "role"], "gateway"], 9, 7],
            // спутники
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
            // ground_site
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

      // ---------- Клик ----------
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

        if (activePopupRef.current) {
          activePopupRef.current.root.unmount();
          activePopupRef.current.popup.remove();
          activePopupRef.current = null;
        }

        const container = document.createElement("div");
        const popup = new maplibregl.Popup({ offset: 12, maxWidth: "300px" })
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
            colors={COLORS}
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
    const source = mapRef.current.getSource("graph-source");
    if (source) source.setData(geojson);
  }, [geojson]);

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