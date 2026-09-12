import React from "react";

function formatInterval(start, end) {
  const dur = end - start;
  const fmt = (s) => {
    if (s < 60) return `${s} с`;
    if (s < 3600) return `${(s / 60).toFixed(0)} мин`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h} ч ${m} мин` : `${h} ч`;
  };
  return `${start}–${end} с (${fmt(dur)})`;
}

export default function OverridesPanel({ overrides, onClear, onRecalc }) {
  const failures = overrides.failures || [];
  const outages = overrides.gateway_outages || [];
  const planes = overrides.planes || [];
  const stage = overrides.launch_stage;
  const total = failures.length + outages.length + planes.length + (stage != null ? 1 : 0);

  if (!total) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        background: "rgba(255,255,255,0.97)",
        color: "#1f2937",
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
        padding: "10px 12px",
        zIndex: 20,
        fontSize: 12,
        maxWidth: 320,
        lineHeight: 1.35,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#111827" }}>
        Overrides: {total}
      </div>

      {stage != null && (
        <div style={{ marginBottom: 4 }}>
          <b style={{ color: "#111827" }}>Этап:</b> очередь {stage}
        </div>
      )}

      {planes.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <b style={{ color: "#111827" }}>Плоскости ({planes.length}):</b>
          <ul style={{ margin: "2px 0 0 0", paddingLeft: 16 }}>
            {planes.map((p) => (
              <li key={p.id}>
                {p.id} · RAAN {p.raan_deg}° · фаза {p.phase_deg}°
              </li>
            ))}
          </ul>
        </div>
      )}

      {failures.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <b style={{ color: "#111827" }}>Спутники:</b>
          <ul style={{ margin: "2px 0 0 0", paddingLeft: 16 }}>
            {failures.map((f, i) => (
              <li key={i}>
                {f.satellite_id} · {formatInterval(f.start_s, f.end_s)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {outages.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <b style={{ color: "#111827" }}>Шлюзы:</b>
          <ul style={{ margin: "2px 0 0 0", paddingLeft: 16 }}>
            {outages.map((o, i) => (
              <li key={i}>
                {o.gateway_id} · {formatInterval(o.start_s, o.end_s)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          onClick={onRecalc}
          style={{
            flex: 1,
            padding: "5px 8px",
            background: "#3b82f6",
            color: "#fff",
            border: 0,
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ↻ Пересчитать
        </button>
        <button
          onClick={onClear}
          style={{
            padding: "5px 8px",
            background: "#e5e7eb",
            color: "#1f2937",
            border: 0,
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}