import React from "react";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h > 0) parts.push(`${h} ч`);
  if (m > 0) parts.push(`${m} мин`);
  if (!parts.length) parts.push(`${s} с`);
  return parts.join(" ");
}

export default function AvailabilityTimeline({
  clients,
  perClientMetrics,
  maxTime,
  currentTime,
  selectedClient,
  onSelectClient,
}) {
  if (!clients?.length) return null;

  return (
    <div
      style={{
        margin: "12px 24px",
        padding: "12px 16px",
        background: "#fff",
        color: "#1f2937",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <b style={{ color: "#111827", fontSize: 14 }}>
          Диаграмма доступности
        </b>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: "#10b981",
              borderRadius: 2,
              marginRight: 4,
            }}
          />
          связь есть
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: "#ef4444",
              borderRadius: 2,
              margin: "0 4px 0 12px",
            }}
          />
          перерыв
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: 10,
              background: "#f59e0b",
              margin: "0 4px 0 12px",
            }}
          />
          текущее t_s
        </span>
      </div>

      <div>
        {clients.map((c) => {
          const m = perClientMetrics?.[c.id];
          const gaps = m?.gaps || [];
          const isActive = selectedClient === c.id;
          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                padding: "4px 6px",
                borderRadius: 4,
                background: isActive ? "#eff6ff" : "transparent",
              }}
            >
              <button
                onClick={() =>
                  onSelectClient?.(isActive ? null : c.id)
                }
                style={{
                  width: 60,
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#1d4ed8" : "#1f2937",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  padding: 0,
                }}
                title="Кликните, чтобы показать маршрут"
              >
                {c.id}
              </button>

              <div
                style={{
                  position: "relative",
                  flex: 1,
                  height: 16,
                  background: "#10b981",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                {/* Красные перерывы */}
                {gaps.map((g, i) => {
                  const left = (g.start_s / maxTime) * 100;
                  const width = ((g.end_s - g.start_s) / maxTime) * 100;
                  return (
                    <div
                      key={i}
                      title={`Перерыв: ${formatTime(g.duration_s)}`}
                      style={{
                        position: "absolute",
                        left: `${left}%`,
                        width: `${width}%`,
                        top: 0,
                        bottom: 0,
                        background: "#ef4444",
                      }}
                    />
                  );
                })}
                {/* Курсор текущего t_s */}
                <div
                  style={{
                    position: "absolute",
                    left: `${(currentTime / maxTime) * 100}%`,
                    top: -2,
                    bottom: -2,
                    width: 2,
                    background: "#f59e0b",
                    boxShadow: "0 0 4px rgba(0,0,0,0.3)",
                  }}
                />
              </div>

              <div
                style={{
                  width: 110,
                  textAlign: "right",
                  fontSize: 12,
                  color: "#374151",
                }}
              >
                {m?.path_pct != null
                  ? `${m.path_pct.toFixed(1)}% / ${formatTime(m.max_gap_s || 0)}`
                  : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "#9ca3af",
          marginTop: 4,
          paddingLeft: 68,
          paddingRight: 118,
        }}
      >
        <span>0</span>
        <span>{formatTime(maxTime / 2)}</span>
        <span>{formatTime(maxTime)}</span>
      </div>
    </div>
  );
}