import React from "react";

const STAGES = [
  { value: 1, label: "Очередь 1", hint: "до 16 КА" },
  { value: 2, label: "Очередь 2", hint: "до 32 КА" },
  { value: 3, label: "Очередь 3", hint: "все 48 КА" },
];

export default function LaunchStageSelector({ value, onChange, disabled }) {
  return (
    <div
      style={{
        margin: "12px 24px 0",
        padding: "10px 14px",
        background: "#fff",
        color: "#1f2937",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
      }}
    >
      <b style={{ fontSize: 13, color: "#111827" }}>Этап развёртывания:</b>
      <div style={{ display: "flex", gap: 6 }}>
        {STAGES.map((s) => {
          const active = value === s.value;
          return (
            <button
              key={s.value}
              onClick={() => !disabled && onChange(s.value)}
              disabled={disabled}
              title={s.hint}
              style={{
                padding: "6px 12px",
                border: active ? "1px solid #1d4ed8" : "1px solid #d1d5db",
                background: active ? "#dbeafe" : "#fff",
                color: active ? "#1d4ed8" : "#1f2937",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {s.label}
              <span
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "#6b7280",
                  fontWeight: 400,
                }}
              >
                {s.hint}
              </span>
            </button>
          );
        })}
      </div>
      {disabled && (
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          загрузка...
        </span>
      )}
    </div>
  );
}