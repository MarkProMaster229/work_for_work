import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import "./jabajaba.css";
import { api } from "./api.jsx";

import KpiPanel from "./components/KpiPanel";
import ControlPanel from "./components/ControlPanel";
import MapView from "./components/MapView";
import FrameDecoration from "./components/FrameDecoration";
import PipeDecoration from "./components/PipeDecoration";
import LoadingOverlay from "./components/LoadingOverlay";
import ErrorBanner from "./components/ErrorBanner";
import OverridesPanel from "./components/OverridesPanel";
import AvailabilityTimeline from "./components/AvailabilityTimeline";
import ReasonsPanel from "./components/ReasonsPanel";
import VariantsPanel from "./components/VariantsPanel";
import LaunchStageSelector from "./components/LaunchStageSelector";
import PlaneEditor from "./components/PlaneEditor";
import ConstellationPanel from "./components/ConstellationPanel";

import { useFrames } from "./hooks/useFrames";
import { usePipeJoints } from "./hooks/usePipeJoints";
import {
  transformBackendToGeoJSON,
  buildRouteGeoJSON,
  summarizeMetrics,
} from "./utils/geojson";

const EMPTY_KPI = {
  minAvailability: "—",
  avgAvailability: "—",
  maxBreak: "—",
  activeKA: 0,
};

const EMPTY_OVERRIDES = {
  launch_stage: null,
  planes: [],
  failures: [],
  gateway_outages: [],
};

function hasAnyOverride(o) {
  if (!o) return false;
  if (o.launch_stage != null) return true;
  if ((o.planes?.length || 0) > 0) return true;
  if ((o.failures?.length || 0) > 0) return true;
  if ((o.gateway_outages?.length || 0) > 0) return true;
  return false;
}

function cleanOverrides(o) {
  const out = {};
  if (o.launch_stage != null) out.launch_stage = o.launch_stage;
  if (o.planes?.length) out.planes = o.planes;
  if (o.failures?.length) out.failures = o.failures;
  if (o.gateway_outages?.length) out.gateway_outages = o.gateway_outages;
  return out;
}

/** Слайдер идёт до horizon_s - step_s: правый конец не входит в расчёт. */
function effectiveMax(env) {
  if (!env?.horizon_s) return 86400 - 120;
  const step = env.step_s ?? 120;
  return Math.max(step, env.horizon_s - step);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} ч`);
  if (m > 0) parts.push(`${m} мин`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec} с`);
  return parts.join(" ");
}

/** Ошибка с указанием поля: "Ошибка в поле «altitude_km»: ...". */
function formatLoadError(err) {
  const field = err?.field;
  const msg = err?.message || "неизвестная ошибка";
  if (field) return `Ошибка в поле «${field}»: ${msg}`;
  return msg;
}

function addOrMergeInterval(list, idKey, newItem) {
  const sameId = list.filter((x) => x[idKey] === newItem[idKey]);
  const others = list.filter((x) => x[idKey] !== newItem[idKey]);
  const all = [
    ...sameId.map((x) => [x.start_s, x.end_s]),
    [newItem.start_s, newItem.end_s],
  ].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of all) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return [
    ...others,
    ...merged.map(([s, e]) => ({ [idKey]: newItem[idKey], start_s: s, end_s: e })),
  ];
}

export default function App() {
  const [kpi, setKpi] = useState(EMPTY_KPI);
  const [perClientMetrics, setPerClientMetrics] = useState(null);
  const [scenarioName, setScenarioName] = useState("");
  const [scenario, setScenario] = useState(null);
  const [initialPlanes, setInitialPlanes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingResult, setExportingResult] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [groundSites, setGroundSites] = useState([]);
  const [overrides, setOverrides] = useState(EMPTY_OVERRIDES);
  const [error, setError] = useState(null);
  const [sliderConfig, setSliderConfig] = useState({ max: 86280, step: 120 });

  const [selectedClient, setSelectedClient] = useState(null);

  const [variants, setVariants] = useState([]);
  const [compareResult, setCompareResult] = useState(null);
  const [variantsBusy, setVariantsBusy] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const creamCardRef = useRef(null);
  const mainCardRef = useRef(null);

  const { joints, jerked, jerk, clearJerk } = usePipeJoints();
  const { updateAll } = useFrames([creamCardRef, mainCardRef]);

  const clients = useMemo(
    () => groundSites.filter((s) => s.role === "client"),
    [groundSites],
  );

  // --- станции ---
  const refreshGroundSites = useCallback(async () => {
    try {
      const data = await api.getGroundSites();
      setGroundSites([...(data.clients || []), ...(data.gateways || [])]);
    } catch (err) {
      console.error("getGroundSites failed:", err);
    }
  }, []);

  useEffect(() => {
    refreshGroundSites();
  }, [refreshGroundSites]);

  // --- варианты ---
  const refreshVariants = useCallback(async () => {
    try {
      const data = await api.listVariants();
      setVariants(data?.variants || []);
    } catch (err) {
      console.warn("listVariants failed:", err);
    }
  }, []);

  useEffect(() => {
    refreshVariants();
  }, [refreshVariants]);

  // --- авто-подхват сценария ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.exportScenario({});
        if (cancelled) return;
        const s = data?.effective_scenario || data;
        setScenario(s);
        const env = s?.environment || {};
        if (env.horizon_s) {
          setSliderConfig({
            max: effectiveMax(env),
            step: env.step_s ?? 120,
          });
        }
        if (s?.design?.planes?.length) {
          setInitialPlanes(s.design.planes);
        }
        if (!scenarioName && (s?.meta?.title || s?.meta?.id)) {
          setScenarioName(s.meta.title || s.meta.id);
        }
      } catch (err) {
        console.warn("Не удалось получить сценарий:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- снапшот ---
  const fetchSnapshot = useCallback(async (t_s, ovr) => {
    const clean = cleanOverrides(ovr);
    const data = hasAnyOverride(ovr)
      ? await api.getSnapshotWithOverrides(t_s, clean)
      : await api.getSnapshot(t_s);
    setSnapshot(data);
    return data;
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;

    fetchSnapshot(currentTime, overrides)
      .then((data) => {
        if (cancelled) return;
        const activeKA = (data.satellites || []).filter((s) => s.active).length;
        setKpi((prev) => ({ ...prev, activeKA }));
      })
      .catch((err) => {
        if (!cancelled) console.error("getSnapshot failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTime, mapReady, overrides, fetchSnapshot]);

  const geojson = useMemo(() => {
    if (!snapshot) return { type: "FeatureCollection", features: [] };
    return transformBackendToGeoJSON(snapshot, groundSites);
  }, [snapshot, groundSites]);

  const routeGeojson = useMemo(() => {
    if (!snapshot) return { type: "FeatureCollection", features: [] };
    return buildRouteGeoJSON(snapshot, groundSites, selectedClient);
  }, [snapshot, groundSites, selectedClient]);

  const routes = snapshot?.routes || {};
  const servingSatellites = snapshot?.serving_satellites || {};

  const applyMetrics = useCallback((calcResult) => {
    const summary = summarizeMetrics(calcResult);
    setPerClientMetrics(summary.perClient);
    setKpi((prev) => ({
      ...prev,
      minAvailability:
        summary.minAvailability != null
          ? `${summary.minAvailability.toFixed(1)}%`
          : "—",
      avgAvailability:
        summary.avgAvailability != null
          ? `${summary.avgAvailability.toFixed(1)}%`
          : "—",
      maxBreak: summary.maxBreak != null ? `${summary.maxBreak} с` : "—",
    }));
  }, []);

  const recalcAll = useCallback(
    async (ovr) => {
      setRecalcBusy(true);
      try {
        const clean = cleanOverrides(ovr);
        const calc = await api.calculate(hasAnyOverride(ovr) ? clean : null);
        applyMetrics(calc);
        await fetchSnapshot(currentTime, ovr);
        return calc;
      } finally {
        setRecalcBusy(false);
      }
    },
    [applyMetrics, fetchSnapshot, currentTime],
  );

  const handleNodeOverride = useCallback(
    async ({ id, kind, start_s, end_s }) => {
      if (kind !== "satellite" && kind !== "gateway") return;

      let next;
      if (kind === "satellite") {
        next = {
          ...overrides,
          failures: addOrMergeInterval(overrides.failures || [], "satellite_id", {
            satellite_id: id,
            start_s,
            end_s,
          }),
        };
      } else {
        next = {
          ...overrides,
          gateway_outages: addOrMergeInterval(
            overrides.gateway_outages || [],
            "gateway_id",
            { gateway_id: id, start_s, end_s },
          ),
        };
      }
      setOverrides(next);
      try {
        await recalcAll(next);
      } catch (err) {
        console.error("recalc failed:", err);
        setError("Не удалось пересчитать: " + (err.message || ""));
      }
    },
    [overrides, recalcAll],
  );

  const handleLaunchStage = useCallback(
    async (stage) => {
      const next = { ...overrides, launch_stage: stage };
      setOverrides(next);
      try {
        await recalcAll(next);
      } catch (err) {
        console.error("launch_stage recalc failed:", err);
        setError("Не удалось пересчитать: " + (err.message || ""));
      }
    },
    [overrides, recalcAll],
  );

  const handlePlanesApply = useCallback(
    async (planes) => {
      const next = { ...overrides, planes };
      setOverrides(next);
      try {
        await recalcAll(next);
      } catch (err) {
        console.error("planes recalc failed:", err);
        setError("Не удалось пересчитать: " + (err.message || ""));
      }
    },
    [overrides, recalcAll],
  );

  const handlePlanesReset = useCallback(async () => {
    const next = { ...overrides, planes: [] };
    setOverrides(next);
    try {
      await recalcAll(next);
    } catch (err) {
      console.error("planes reset failed:", err);
    }
  }, [overrides, recalcAll]);

  const handleClearOverrides = useCallback(async () => {
    setOverrides(EMPTY_OVERRIDES);
    try {
      await recalcAll(EMPTY_OVERRIDES);
    } catch (err) {
      console.error(err);
    }
  }, [recalcAll]);

  const handleRecalc = useCallback(async () => {
    try {
      await recalcAll(overrides);
    } catch (err) {
      console.error(err);
      setError("Ошибка пересчёта: " + (err.message || ""));
    }
  }, [overrides, recalcAll]);

  // --- полный сброс ---
  const handleResetAll = useCallback(async () => {
    setResetting(true);
    try {
      setOverrides(EMPTY_OVERRIDES);
      setSelectedClient(null);
      setCompareResult(null);
      setCurrentTime(0);
      await recalcAll(EMPTY_OVERRIDES);
    } catch (err) {
      console.error("reset all failed:", err);
      setError("Не удалось сбросить: " + (err.message || ""));
    } finally {
      setResetting(false);
    }
  }, [recalcAll]);

  // --- загрузка сценария ---
  const handleScenarioFile = useCallback(
    async (file) => {
      try {
        const text = await file.text();
        let scenarioJson;
        try {
          scenarioJson = JSON.parse(text);
        } catch (e) {
          throw Object.assign(new Error("не является корректным JSON"), {
            field: "файл",
          });
        }

        const info = await api.loadScenario(scenarioJson);
        console.log("Сценарий принят бэкендом:", info);

        setScenario(scenarioJson);
        setScenarioName(
          scenarioJson.meta?.title || scenarioJson.meta?.id || file.name,
        );
        setSliderConfig({
          max: effectiveMax(scenarioJson.environment),
          step: scenarioJson.environment?.step_s ?? 120,
        });
        if (scenarioJson.design?.planes?.length) {
          setInitialPlanes(scenarioJson.design.planes);
        }
        setOverrides(EMPTY_OVERRIDES);
        setPerClientMetrics(null);
        setCompareResult(null);
        setSelectedClient(null);
        setCurrentTime(0);
        await refreshGroundSites();

        const freshSnap = await api.getSnapshot(0);
        setSnapshot(freshSnap);

        const calc = await api.calculate();
        applyMetrics(calc);
        setError(null);
      } catch (err) {
        console.error("handleScenarioFile:", err);
        setError("Не удалось загрузить сценарий. " + formatLoadError(err));
      }
    },
    [refreshGroundSites, applyMetrics],
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const clean = cleanOverrides(overrides);
      const data = await api.exportScenario(
        hasAnyOverride(overrides) ? clean : {},
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scenario-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("export failed:", err);
      setError("Не удалось выгрузить сценарий: " + (err.message || ""));
    } finally {
      setExporting(false);
    }
  }, [overrides]);

  const handleExportResult = useCallback(async () => {
    setExportingResult(true);
    try {
      const clean = cleanOverrides(overrides);
      const data = await api.exportResult(
        hasAnyOverride(overrides) ? clean : null,
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `result-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("exportResult failed:", err);
      setError("Не удалось выгрузить результат: " + (err.message || ""));
    } finally {
      setExportingResult(false);
    }
  }, [overrides]);

  const handleSaveVariant = useCallback(
    async (name, ovr, description) => {
      setVariantsBusy(true);
      try {
        await api.saveVariant(name, cleanOverrides(ovr), description);
        await refreshVariants();
      } catch (err) {
        setError("Не удалось сохранить вариант: " + (err.message || ""));
      } finally {
        setVariantsBusy(false);
      }
    },
    [refreshVariants],
  );

  const handleDeleteVariant = useCallback(
    async (name) => {
      setVariantsBusy(true);
      try {
        await api.deleteVariant(name);
        await refreshVariants();
        if (
          compareResult?.variant_a?.name === name ||
          compareResult?.variant_b?.name === name
        ) {
          setCompareResult(null);
        }
      } catch (err) {
        setError("Не удалось удалить вариант: " + (err.message || ""));
      } finally {
        setVariantsBusy(false);
      }
    },
    [refreshVariants, compareResult],
  );

  const handleCompare = useCallback(async (a, b) => {
    setVariantsBusy(true);
    try {
      const result = await api.compareVariants(a, b);
      setCompareResult(result);
    } catch (err) {
      setError("Не удалось сравнить варианты: " + (err.message || ""));
    } finally {
      setVariantsBusy(false);
    }
  }, []);

  useEffect(() => {
    updateAll();
  }, [updateAll]);

  const timePresets = useMemo(
    () =>
      [0, 3600, 21600, 43200, 64800, 86400].filter(
        (v) => v <= sliderConfig.max,
      ),
    [sliderConfig.max],
  );

  const selectedMetrics = selectedClient
    ? perClientMetrics?.[selectedClient]
    : null;

  // реальная длина расчётного периода: последний момент + шаг
  const fullHorizon = sliderConfig.max + sliderConfig.step;

  return (
    <div className="app">
      <div className="layout">
        <KpiPanel kpi={kpi} ref={creamCardRef} />

        <ControlPanel
          ref={mainCardRef}
          scenarioName={scenarioName}
          onScenarioFile={handleScenarioFile}
          isLoading={isLoading}
          onToggleLoading={() => setIsLoading(!isLoading)}
          onExport={handleExport}
          exporting={exporting}
          onExportResult={handleExportResult}
          exportingResult={exportingResult}
          onResetAll={handleResetAll}
          resetting={resetting}
        />

        <ConstellationPanel scenario={scenario} />

        <LaunchStageSelector
          value={overrides.launch_stage}
          onChange={handleLaunchStage}
          disabled={!mapReady || recalcBusy}
        />

        <PlaneEditor
          initialPlanes={initialPlanes}
          appliedPlanes={overrides.planes}
          onApply={handlePlanesApply}
          onReset={handlePlanesReset}
          busy={recalcBusy}
        />

        <section
          className="card map-panel"
          style={{ position: "relative", minHeight: 450, flexGrow: 1 }}
        >
          <MapView
            geojson={geojson}
            routeGeojson={routeGeojson}
            onLoaded={() => setMapReady(true)}
            currentTime={currentTime}
            onNodeOverride={handleNodeOverride}
            onSelectClient={setSelectedClient}
            selectedClient={selectedClient}
            maxDuration={sliderConfig.max}
            horizonS={fullHorizon}
            routes={routes}
            servingSatellites={servingSatellites}
          />

          <OverridesPanel
            overrides={overrides}
            onClear={handleClearOverrides}
            onRecalc={handleRecalc}
          />

          <div
            className="map-time-control"
            style={{
              position: "absolute",
              bottom: 20,
              left: 20,
              background: "rgba(255,255,255,0.95)",
              color: "#1f2937",
              padding: "12px 16px",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              zIndex: 10,
              pointerEvents: "auto",
              minWidth: 260,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Мониторинг временной шкалы
            </div>
            <div
              style={{
                margin: "4px 0 8px 0",
                fontSize: 16,
                fontWeight: "bold",
                color: "#111827",
              }}
            >
              t_s = {currentTime} сек.
              <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>
                ({formatTime(currentTime)})
              </span>
            </div>

            <input
              type="range"
              min="0"
              max={sliderConfig.max}
              step={sliderConfig.step}
              value={currentTime}
              onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
              style={{ width: "100%", display: "block", cursor: "pointer" }}
            />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <label style={{ fontSize: 11, color: "#6b7280", minWidth: 60 }}>
                Точно, с:
              </label>
              <input
                type="number"
                min="0"
                max={sliderConfig.max}
                step="1"
                value={currentTime}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isNaN(v)) return;
                  setCurrentTime(Math.max(0, Math.min(sliderConfig.max, v)));
                }}
                style={{
                  width: 100,
                  padding: "4px 8px",
                  fontSize: 13,
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  color: "#1f2937",
                  background: "#fff",
                }}
              />
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                / {sliderConfig.max}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginTop: 6,
              }}
            >
              {timePresets.map((v) => (
                <button
                  key={v}
                  onClick={() => setCurrentTime(v)}
                  style={{
                    fontSize: 10,
                    padding: "3px 6px",
                    border: "1px solid #ddd",
                    background: currentTime === v ? "#e5edff" : "#fff",
                    color: "#1f2937",
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  {formatTime(v)}
                </button>
              ))}
            </div>

            {!mapReady && (
              <span
                style={{
                  fontSize: 10,
                  color: "#f59e0b",
                  display: "block",
                  marginTop: 6,
                }}
              >
                Синхронизация потока...
              </span>
            )}
          </div>

          <FrameDecoration />
        </section>
      </div>

      {perClientMetrics && (
        <AvailabilityTimeline
          clients={clients}
          perClientMetrics={perClientMetrics}
          maxTime={fullHorizon}
          currentTime={currentTime}
          selectedClient={selectedClient}
          onSelectClient={setSelectedClient}
        />
      )}

      {selectedMetrics && (
        <ReasonsPanel
          clientId={selectedClient}
          reasons={selectedMetrics.reasons}
          maxGapS={selectedMetrics.max_gap_s}
          pathPct={selectedMetrics.path_pct}
        />
      )}

      <VariantsPanel
        overrides={overrides}
        variants={variants}
        onSave={handleSaveVariant}
        onDelete={handleDeleteVariant}
        onCompare={handleCompare}
        compareResult={compareResult}
        onClearCompare={() => setCompareResult(null)}
        busy={variantsBusy}
      />

      {perClientMetrics && (
        <div
          style={{
            margin: "12px 24px",
            padding: "12px 16px",
            background: "#f9fafb",
            color: "#1f2937",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            fontSize: 13,
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          }}
        >
          <b style={{ color: "#111827" }}>Клиенты сейчас:</b>
          <table
            style={{
              marginTop: 8,
              borderCollapse: "collapse",
              width: "100%",
              maxWidth: 820,
              color: "#1f2937",
            }}
          >
            <thead>
              <tr style={{ background: "#f3f4f6", color: "#111827" }}>
                <th style={{ textAlign: "left", padding: "6px 12px" }}>Клиент</th>
                <th style={{ textAlign: "right", padding: "6px 12px" }}>Видимость</th>
                <th style={{ textAlign: "right", padding: "6px 12px" }}>Доступность</th>
                <th style={{ textAlign: "right", padding: "6px 12px" }}>Макс. перерыв</th>
                <th style={{ textAlign: "right", padding: "6px 12px" }}>Ср. hops</th>
                <th style={{ textAlign: "center", padding: "6px 12px" }}>90%</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(perClientMetrics).map(([id, m]) => {
                const ok = (m.path_pct ?? 0) >= 90;
                return (
                  <tr
                    key={id}
                    style={{
                      borderTop: "1px solid #e5e7eb",
                      background: selectedClient === id ? "#eff6ff" : "transparent",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedClient(id)}
                  >
                    <td style={{ padding: "6px 12px", fontWeight: 600 }}>{id}</td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "6px 12px",
                        color: "#6b7280",
                      }}
                    >
                      {m.visibility_pct != null
                        ? `${m.visibility_pct.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 12px" }}>
                      {m.path_pct != null ? `${m.path_pct.toFixed(2)}%` : "—"}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 12px" }}>
                      {m.max_gap_s != null ? `${m.max_gap_s} с` : "—"}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 12px" }}>
                      {m.avg_hops != null ? m.avg_hops.toFixed(2) : "—"}
                    </td>
                    <td
                      style={{
                        textAlign: "center",
                        padding: "6px 12px",
                        color: ok ? "#16a34a" : "#dc2626",
                        fontWeight: 600,
                      }}
                    >
                      {ok ? "OK" : "НЕ ДОСТИГНУТ"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ErrorBanner message={error} onClose={() => setError(null)} />

      <PipeDecoration
        joints={joints}
        jerked={jerked}
        onClick={jerk}
        onAnimationEnd={clearJerk}
      />

      <LoadingOverlay visible={isLoading} onClose={() => setIsLoading(false)} />
    </div>
  );
}