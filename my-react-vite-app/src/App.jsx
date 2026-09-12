import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import './jabajaba.css';
import { api } from './api.jsx';

import KpiPanel from './components/KpiPanel';
import ControlPanel from './components/ControlPanel';
import MapView from './components/MapView';
import FrameDecoration from './components/FrameDecoration';
import PipeDecoration from './components/PipeDecoration';
import LoadingOverlay from './components/LoadingOverlay';
import ErrorBanner from './components/ErrorBanner';

import { useFrames } from './hooks/useFrames';
import { usePipeJoints } from './hooks/usePipeJoints';
import { transformBackendToGeoJSON } from './utils/geojson';

export default function App() {
  const [kpi, setKpi] = useState({
    minAvailability: '—',
    avgAvailability: '—',
    maxBreak: '—',
    activeKA: 0,
  });

  const [scenarioName, setScenarioName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [groundSites, setGroundSites] = useState([]);
  const [error, setError] = useState(null);
  const [sliderConfig, setSliderConfig] = useState({ max: 3600, step: 10 });

  const creamCardRef = useRef(null);
  const mainCardRef = useRef(null);

  const { joints, jerked, jerk, clearJerk } = usePipeJoints();
  const { updateAll } = useFrames([creamCardRef, mainCardRef]);

  // --- Загрузка станций при старте ---
  const refreshGroundSites = useCallback(async () => {
    try {
      const data = await api.getGroundSites();
      setGroundSites([...(data.clients || []), ...(data.gateways || [])]);
    } catch (err) {
      console.error('getGroundSites failed:', err);
    }
  }, []);

  useEffect(() => { refreshGroundSites(); }, [refreshGroundSites]);

  // --- Снапшот при изменении времени ---
  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;

    api.getSnapshot(currentTime)
      .then((data) => { if (!cancelled) setSnapshot(data); })
      .catch((err) => { if (!cancelled) console.error('getSnapshot failed:', err); });

    return () => { cancelled = true; };
  }, [currentTime, mapReady]);

  // --- GeoJSON ---
  const geojson = useMemo(() => {
    if (!snapshot) return { type: 'FeatureCollection', features: [] };
    return transformBackendToGeoJSON(snapshot, groundSites);
  }, [snapshot, groundSites]);

  // --- Загрузка сценария (ИСПРАВЛЕНО) ---
const handleScenarioFile = useCallback(async (file) => {
  try {
    const text = await file.text();
    const scenario = JSON.parse(text);

    // 1. Отправить сценарий на бэкенд
    const info = await api.loadScenario(scenario);
    console.log('Сценарий принят бэкендом:', info);

    // 2. Обновить заголовок и слайдер
    setScenarioName(scenario.name || file.name);
    setSliderConfig({
      max: scenario.environment?.horizon_s ?? 3600,
      step: scenario.environment?.step_s ?? 10,
    });

    // 3. Сбросить время, перезапросить станции и снапшот
    setCurrentTime(0);
    await refreshGroundSites();

    const freshSnap = await api.getSnapshot(0);
    setSnapshot(freshSnap);

    // 4. Обновить KPI
    const metrics = await api.calculate();
    console.log('Метрики:', metrics);
    setKpi({
      minAvailability: metrics.min_availability_pct != null
        ? `${metrics.min_availability_pct.toFixed(1)}%` : '—',
      avgAvailability: metrics.avg_availability_pct != null
        ? `${metrics.avg_availability_pct.toFixed(1)}%` : '—',
      maxBreak: metrics.max_break_s != null
        ? `${metrics.max_break_s} с` : '—',
      activeKA: metrics.active_satellites ?? 0,
    });

    setError(null);
  } catch (err) {
    console.error('handleScenarioFile:', err);
    setError('Не удалось загрузить сценарий: ' + err.message);
  }
}, [refreshGroundSites]);

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
        />

        <section className="card map-panel" style={{ position: 'relative', minHeight: '450px', flexGrow: 1 }}>
          <MapView geojson={geojson} onLoaded={() => setMapReady(true)} />

          <div className="map-time-control" style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'rgba(255, 255, 255, 0.9)',
            padding: '12px 16px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 10,
            pointerEvents: 'auto',
          }}>
            <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Мониторинг временной шкалы
            </div>
            <div style={{ margin: '4px 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>
              t_s = {currentTime} сек.
            </div>
            <input
              type="range"
              min="0"
              max={sliderConfig.max}
              step={sliderConfig.step}
              value={currentTime}
              onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
              style={{ width: '180px', display: 'block', cursor: 'pointer' }}
            />
            {!mapReady && (
              <span style={{ fontSize: '10px', color: '#f59e0b', display: 'block', marginTop: '4px' }}>
                Синхронизация потока...
              </span>
            )}
          </div>

          <FrameDecoration />
        </section>
      </div>

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