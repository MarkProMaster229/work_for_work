import React, { useState, useEffect, useMemo } from "react";

const EPS = 1e-6;

function planesEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    return (
      p.id === q.id &&
      Math.abs((p.raan_deg ?? 0) - (q.raan_deg ?? 0)) < EPS &&
      Math.abs((p.phase_deg ?? 0) - (q.phase_deg ?? 0)) < EPS
    );
  });
}

export default function PlaneEditor({
  initialPlanes = [],
  appliedPlanes = null,
  onApply,
  onReset,
  busy = false,
}) {
  const base = appliedPlanes?.length ? appliedPlanes : initialPlanes;

  const [draft, setDraft] = useState(() => base.map((p) => ({ ...p })));

  // Синхронизировать draft, когда меняется база (загрузили сценарий,
  // применили overrides, сбросили)
  useEffect(() => {
    setDraft(base.map((p) => ({ ...p })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlanes, appliedPlanes]);

  const changed = useMemo(() => !planesEqual(draft, base), [draft, base]);

  const touchedIds = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < draft.length; i++) {
      const d = draft[i];
      const b = base[i];
      if (
        !b ||
        d.id !== b.id ||
        Math.abs((d.raan_deg ?? 0) - (b.raan_deg ?? 0)) > EPS ||
        Math.abs((d.phase_deg ?? 0) - (b.phase_deg ?? 0)) > EPS
      ) {
        s.add(d.id);
      }
    }
    return s;
  }, [draft, base]);

  const update = (id, key, value) => {
    const v = Number(value);
    setDraft((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [key]: v } : p)),
    );
  };

  const handleApply = () => {
    const payload = draft.map((p) => ({
      id: p.id,
      raan_deg: p.raan_deg ?? 0,
      phase_deg: p.phase_deg ?? 0,
    }));
    onApply?.(payload);
  };

  const handleReset = () => {
    setDraft(initialPlanes.map((p) => ({ ...p })));
    onReset?.();
  };

  if (!initialPlanes?.length) {
    return (
      <div
        style={{
          margin: "12px 24px 0",
          padding: "10px 14px",
          background: "#fff",
          color: "#6b7280",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          fontSize: 12,
        }}
      >
        Плоскости не загружены — выберите сценарий или дождитесь загрузки.
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "12px 24px 0",
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
        <b style={{ fontSize: 14, color: "#111827" }}>
          Редактор плоскостей · RAAN / фазирование
        </b>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          Плоскостей: {initialPlanes.length}
          {touchedIds.size > 0 && (
            <>
              {" · изменено: "}
              <b style={{ color: "#dc2626" }}>{touchedIds.size}</b>
            </>
          )}
        </span>
      </div>

      <div
        style={{
          maxHeight: 260,
          overflow: "auto",
          border: "1px solid #f3f4f6",
          borderRadius: 4,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            color: "#1f2937",
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              background: "#f9fafb",
              zIndex: 1,
            }}
          >
            <tr>
              <th style={{ textAlign: "left", padding: "6px 10px" }}>Плоскость</th>
              <th style={{ textAlign: "right", padding: "6px 10px" }}>RAAN, °</th>
              <th style={{ textAlign: "right", padding: "6px 10px" }}>Фаза, °</th>
              <th style={{ textAlign: "center", padding: "6px 10px" }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((p) => {
              const touched = touchedIds.has(p.id);
              return (
                <tr
                  key={p.id}
                  style={{
                    borderTop: "1px solid #f3f4f6",
                    background: touched ? "#fef2f2" : "transparent",
                  }}
                >
                  <td
                    style={{
                      padding: "4px 10px",
                      fontWeight: 600,
                      color: touched ? "#b91c1c" : "#1f2937",
                    }}
                  >
                    {p.id}
                  </td>
                  <td style={{ textAlign: "right", padding: "4px 10px" }}>
                    <input
                      type="number"
                      min="0"
                      max="360"
                      step="0.1"
                      value={p.raan_deg ?? 0}
                      onChange={(e) => update(p.id, "raan_deg", e.target.value)}
                      disabled={busy}
                      style={{
                        width: 90,
                        padding: "3px 6px",
                        fontSize: 12,
                        border: "1px solid #d1d5db",
                        borderRadius: 4,
                        textAlign: "right",
                        color: "#1f2937",
                        background: "#fff",
                      }}
                    />
                  </td>
                  <td style={{ textAlign: "right", padding: "4px 10px" }}>
                    <input
                      type="number"
                      min="0"
                      max="360"
                      step="0.1"
                      value={p.phase_deg ?? 0}
                      onChange={(e) => update(p.id, "phase_deg", e.target.value)}
                      disabled={busy}
                      style={{
                        width: 90,
                        padding: "3px 6px",
                        fontSize: 12,
                        border: "1px solid #d1d5db",
                        borderRadius: 4,
                        textAlign: "right",
                        color: "#1f2937",
                        background: "#fff",
                      }}
                    />
                  </td>
                  <td
                    style={{
                      textAlign: "center",
                      padding: "4px 10px",
                      color: touched ? "#dc2626" : "#d1d5db",
                      fontWeight: 700,
                    }}
                  >
                    {touched ? "●" : "·"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handleApply}
          disabled={busy || !changed}
          style={{
            padding: "6px 14px",
            background: changed ? "#3b82f6" : "#93c5fd",
            color: "#fff",
            border: 0,
            borderRadius: 4,
            cursor: busy || !changed ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {busy ? "…" : "⚡ Применить"}
        </button>
        <button
          onClick={handleReset}
          disabled={busy || touchedIds.size === 0}
          style={{
            padding: "6px 14px",
            background: "#e5e7eb",
            color: "#1f2937",
            border: 0,
            borderRadius: 4,
            cursor: busy || touchedIds.size === 0 ? "not-allowed" : "pointer",
            fontSize: 12,
          }}
        >
          ↺ Сбросить
        </button>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          RAAN поворачивает плоскость вокруг Земли; фаза сдвигает спутники вдоль орбиты
        </span>
      </div>
    </div>
  );
}