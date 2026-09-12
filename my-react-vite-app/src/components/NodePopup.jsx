import React, { useState } from "react";

const DEFAULT_COLORS = {
  client: "#3b82f6",
  gateway: "#f59e0b",
  satelliteActive: "#ef4444",
  satelliteInactive: "#9ca3af",
};

const ROLE_LABEL = {
  client: "Клиент",
  gateway: "Шлюз",
};

const MIN_DURATION_S = 60;
const STEP_S = 60;

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return `${s} с`;
  if (s < 3600) return `${Math.round(s / 60)} мин`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export default function NodePopup({
  node,
  currentTime,
  onApply,
  onClose,
  colors = DEFAULT_COLORS,
  maxDuration = 86400,
}) {
  const MAX_DURATION_S = Math.max(MIN_DURATION_S, maxDuration);

  const isSatellite = node.node_type === "satellite";
  const isGateway = !isSatellite && node.role === "gateway";
  const isClient = !isSatellite && node.role === "client";

  // клиента отключать нельзя — он потребитель, а не ретранслятор
  const canDisable = isSatellite || isGateway;

  const [duration, setDuration] = useState(
    Math.min(3600, MAX_DURATION_S),
  );
  const [pending, setPending] = useState(false);

  const handleApply = async () => {
    if (!canDisable) return;
    setPending(true);
    try {
      await onApply({
        id: node.node_id,
        kind: isSatellite ? "satellite" : "gateway",
        start_s: currentTime,
        end_s: currentTime + duration,
      });
    } finally {
      setPending(false);
    }
  };

  const handleSlider = (e) => {
    setDuration(parseInt(e.target.value, 10));
  };

  const handleInput = (e) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isNaN(v)) return;
    setDuration(
      Math.max(MIN_DURATION_S, Math.min(MAX_DURATION_S, v)),
    );
  };

  // Быстрые пресеты (отфильтрованы по MAX_DURATION_S)
  const presets = [
    { label: "5 мин", value: 300 },
    { label: "30 мин", value: 1800 },
    { label: "1 ч", value: 3600 },
    { label: "6 ч", value: 21600 },
    { label: "12 ч", value: 43200 },
    { label: "24 ч", value: 86400 },
  ].filter((p) => p.value <= MAX_DURATION_S);

  let accent = colors.client;
  if (isSatellite) {
    accent = node.active ? colors.satelliteActive : colors.satelliteInactive;
  } else if (isGateway) {
    accent = colors.gateway;
  }

  const title = isSatellite ? "Спутник" : ROLE_LABEL[node.role] || "Станция";

  return (
    <div style={{ fontFamily: "sans-serif", padding: 4, minWidth: 260 }}>
      <strong style={{ fontSize: 14, color: accent }}>{node.name}</strong>
      <hr style={{ margin: "6px 0", border: 0, borderTop: "1px solid #eee" }} />

      <p style={{ margin: "0 0 3px 0", fontSize: 12 }}>
        <b>ID:</b> {node.node_id}
      </p>
      <p style={{ margin: "0 0 3px 0", fontSize: 12, color: "#666" }}>
        <b>Тип:</b> {title}
      </p>
      <p style={{ margin: "0 0 3px 0", fontSize: 12, color: "#666" }}>
        <b>Координаты:</b> {node.lat.toFixed(4)}, {node.lon.toFixed(4)}
      </p>
      {isSatellite && (
        <p
          style={{
            margin: "0 0 3px 0",
            fontSize: 12,
            color: node.active ? "#16a34a" : "#9ca3af",
          }}
        >
          <b>Статус:</b> {node.active ? "активен" : "неактивен"}
        </p>
      )}

      {canDisable ? (
        <>
          <hr style={{ margin: "6px 0", border: 0, borderTop: "1px solid #eee" }} />

          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "#666",
              marginBottom: 4,
            }}
          >
            {isSatellite ? "Отключить спутник" : "Отключить шлюз"} с{" "}
            <b>t = {currentTime} с</b> на <b>{formatDuration(duration)}</b>
          </label>

          {/* Быстрые пресеты */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: 8,
            }}
          >
            {presets.map((p) => (
              <button
                key={p.value}
                onClick={() => setDuration(p.value)}
                style={{
                  fontSize: 10,
                  padding: "3px 6px",
                  border: "1px solid #ddd",
                  background: duration === p.value ? "#e5edff" : "#fff",
                  color: "#1f2937",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Слайдер */}
          <input
            type="range"
            min={MIN_DURATION_S}
            max={MAX_DURATION_S}
            step={STEP_S}
            value={duration}
            onChange={handleSlider}
            style={{ width: "100%", display: "block", cursor: "pointer" }}
          />

          {/* Ручной ввод секунд */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
            }}
          >
            <input
              type="number"
              min={MIN_DURATION_S}
              max={MAX_DURATION_S}
              step={STEP_S}
              value={duration}
              onChange={handleInput}
              style={{
                width: 90,
                padding: "3px 6px",
                fontSize: 12,
                border: "1px solid #ddd",
                borderRadius: 3,
                color: "#1f2937",
                background: "#fff",
              }}
            />
            <span style={{ fontSize: 11, color: "#666" }}>
              секунд (макс. {MAX_DURATION_S})
            </span>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              onClick={handleApply}
              disabled={pending}
              style={{
                flex: 1,
                padding: "6px 10px",
                background: accent,
                color: "#fff",
                border: 0,
                borderRadius: 4,
                cursor: pending ? "wait" : "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {pending ? "…" : "⚡ Рассчитать"}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "6px 10px",
                background: "#eee",
                color: "#1f2937",
                border: 0,
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              ✕
            </button>
          </div>
        </>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              background: "#eee",
              color: "#1f2937",
              border: 0,
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Закрыть
          </button>
        </div>
      )}
    </div>
  );
}