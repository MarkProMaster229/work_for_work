import React from "react";

const REASON_LABELS = {
  no_visible_satellite: "Нет видимого спутника",
  no_isl_path: "Разрыв межспутниковой сети",
  no_gateway_contact: "Нет контакта со шлюзом",
  gateway_unavailable: "Шлюз недоступен",
  gateway_outage: "Шлюз в отключении",
  satellite_failure: "Спутник отказал",
  no_path: "Нет маршрута",
};

function label(key) {
  return REASON_LABELS[key] || key;
}

export default function ReasonsPanel({ clientId, reasons, maxGapS, pathPct }) {
  if (!clientId) return null;
  const entries = Object.entries(reasons || {}).filter(([, v]) => v > 0);

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
          marginBottom: 8,
        }}
      >
        <b style={{ color: "#111827", fontSize: 14 }}>
          Причины перерывов · {clientId}
        </b>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          Доступность: <b style={{ color: "#111827" }}>{pathPct != null ? `${pathPct.toFixed(2)}%` : "—"}</b>
          {maxGapS != null && (
            <> · Макс. перерыв: <b style={{ color: "#111827" }}>{maxGapS} с</b></>
          )}
        </span>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "#10b981" }}>
          Перерывов не зафиксировано ✅
        </div>
      ) : (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {entries
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => (
              <li key={key}>
                {label(key)} — <b>{count}</b> шагов
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}