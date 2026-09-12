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

import { useFrames } from "./hooks/useFrames";
import { usePipeJoints } from "./hooks/usePipeJoints";
import { transformBackendToGeoJSON, summarizeMetrics } from "./utils/geojson";

const EMPTY_KPI = {
  minAvailability: "—",
  avgAvailability: "—",
  maxBreak: "—",
  activeKA: 0,
};

const EMPTY_OVERRIDES = { failures: [], gateway_outages: [] };

/** Читаемое форматирование: 4320 → "1 ч 12 мин" */
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

/**
 * Добавляет новый интервал в список для конкретного ID,
 * склеивая перекрывающиеся/соседние интервалы этого ID.
 */
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
  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [groundSites, setGroundSites] = useState([]);
  const [overrides, setOverrides] = useState(EMPTY_OVERRIDES);
  const [error, setError] = useState(null);
  const [sliderConfig, setSliderConfig] = useState({ max: 86400, step: 120 });

  const creamCardRef = useRef(null);
  const mainCardRef = useRef(null);

  const { joints, jerked, jerk, clearJerk } = usePipeJoints();
  const { updateAll } = useFrames([creamCardRef, mainCardRef]);

  // ---- наземные станции ----
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

  // ---- авто-подхват горизонта сценария у бэкенда при старте ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scenario = await api.exportScenario(null);
        if (cancelled) return;
        const env = scenario?.environment || {};
        if (env.horizon_s) {
          setSliderConfig({
            max: env.horizon_s,
            step: env.step_s ?? 120,
          });
        }
        if (!scenarioName && (scenario?.meta?.title || scenario?.meta?.id)) {
          setScenarioName(scenario.meta.title || scenario.meta.id);
        }
      } catch (err) {
        console.warn("Не удалось получить горизонт сценария:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- снапшот ----
  const fetchSnapshot = useCallback(async (t_s, ovr) => {
    const hasOvr =
      (ovr.failures?.length || 0) + (ovr.gateway_outages?.length || 0) > 0;
    const data = hasOvr
      ? await api.getSnapshotWithOverrides(t_s, ovr)
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

  // ---- метрики ----
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
      const hasOvr =
        (ovr.failures?.length || 0) + (ovr.gateway_outages?.length || 0) > 0;
      const calc = await api.calculate(hasOvr ? ovr : null);
      applyMetrics(calc);
      await fetchSnapshot(currentTime, ovr);
    },
    [applyMetrics, fetchSnapshot, currentTime],
  );

  // ---- клик по узлу ----
  const handleNodeOverride = useCallback(
    async ({ id, kind, start_s, end_s }) => {
      if (kind !== "satellite" && kind !== "gateway") {
        console.warn("Отключение разрешено только для спутников и шлюзов");
        return;
      }

      let next;
      if (kind === "satellite") {
        next = {
          failures: addOrMergeInterval(overrides.failures || [], "satellite_id", {
            satellite_id: id,
            start_s,
            end_s,
          }),
          gateway_outages: [...(overrides.gateway_outages || [])],
        };
      } else {
        next = {
          failures: [...(overrides.failures || [])],
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
        console.error("recalc after override failed:", err);
        setError("Не удалось пересчитать: " + err.message);
      }
    },
    [overrides, recalcAll],
  );

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
      setError("Ошибка пересчёта: " + err.message);
    }
  }, [overrides, recalcAll]);

  // ---- загрузка сценария ----
  const handleScenarioFile = useCallback(
    async (file) => {
      try {
        const text = await file.text();
        const scenario = JSON.parse(text);

        const info = await api.loadScenario(scenario);
        console.log("Сценарий принят бэкендом:", info);

        setScenarioName(scenario.meta?.title || scenario.meta?.id || file.name);
        setSliderConfig({
          max: scenario.environment?.horizon_s ?? 86400,
          step: scenario.environment?.step_s ?? 120,
        });

        setOverrides(EMPTY_OVERRIDES);
        setPerClientMetrics(null);
        setCurrentTime(0);
        await refreshGroundSites();

        const freshSnap = await api.getSnapshot(0);
        setSnapshot(freshSnap);

        const calc = await api.calculate();
        applyMetrics(calc);

        setError(null);
      } catch (err) {
        console.error("handleScenarioFile:", err);
        setError("Не удалось загрузить сценарий: " + err.message);
      }
    },
    [refreshGroundSites, applyMetrics],
  );

  // ---- выгрузка ----
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const hasOvr =
        (overrides.failures?.length || 0) +
          (overrides.gateway_outages?.length || 0) >
        0;
      const data = await api.exportScenario(hasOvr ? overrides : null);

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
      setError("Не удалось выгрузить сценарий: " + err.message);
    } finally {
      setExporting(false);
    }
  }, [overrides]);

  useEffect(() => {
    updateAll();
  }, [updateAll]);

  // Пресеты для времени — фильтруются по текущему максимуму
  const timePresets = useMemo(
    () =>
      [0, 3600, 21600, 43200, 64800, 86400].filter(
        (v) => v <= sliderConfig.max,
      ),
    [sliderConfig.max],
  );

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
        />

        <section
          className="card map-panel"
          style={{ position: "relative", minHeight: 450, flexGrow: 1 }}
        >
          <MapView
            geojson={geojson}
            onLoaded={() => setMapReady(true)}
            currentTime={currentTime}
            onNodeOverride={handleNodeOverride}
            maxDuration={sliderConfig.max}
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
              <span
                style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}
              >
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

            {/* Поле точного ввода */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <label
                style={{ fontSize: 11, color: "#6b7280", minWidth: 60 }}
              >
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
                  const clamped = Math.max(
                    0,
                    Math.min(sliderConfig.max, v),
                  );
                  setCurrentTime(clamped);
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

            {/* Пресеты */}
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
              maxWidth: 640,
              color: "#1f2937",
            }}
          >
            <thead>
              <tr style={{ background: "#f3f4f6", color: "#111827" }}>
                <th style={{ textAlign: "left", padding: "6px 12px" }}>
                  Клиент
                </th>
                <th style={{ textAlign: "right", padding: "6px 12px" }}>
                  Доступность
                </th>
                <th style={{ textAlign: "right", padding: "6px 12px" }}>
                  Макс. перерыв
                </th>
                <th style={{ textAlign: "right", padding: "6px 12px" }}>
                  Ср. hops
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(perClientMetrics).map(([id, m]) => (
                <tr key={id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "6px 12px" }}>{id}</td>
                  <td style={{ textAlign: "right", padding: "6px 12px" }}>
                    {m.path_pct != null ? `${m.path_pct.toFixed(2)}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 12px" }}>
                    {m.max_gap_s != null ? `${m.max_gap_s} с` : "—"}
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 12px" }}>
                    {m.avg_hops != null ? m.avg_hops.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
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