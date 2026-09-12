import React, { useState } from "react";

function fmtOverrides(o) {
  const parts = [];
  if (o.launch_stage != null) parts.push(`очередь ${o.launch_stage}`);
  if (o.planes?.length) parts.push(`плоскостей: ${o.planes.length}`);
  if (o.failures?.length) parts.push(`отказов: ${o.failures.length}`);
  if (o.gateway_outages?.length) parts.push(`шлюзов off: ${o.gateway_outages.length}`);
  if (!parts.length) return "—";
  return parts.join(" · ");
}

export default function VariantsPanel({
  overrides,
  variants,
  onSave,
  onDelete,
  onCompare,
  compareResult,
  onClearCompare,
  busy,
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave(name.trim(), overrides, desc.trim());
    setName("");
    setDesc("");
  };

  const handleCompare = async () => {
    if (!a || !b || a === b) return;
    await onCompare(a, b);
  };

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
      <b style={{ fontSize: 14, color: "#111827" }}>Варианты конфигурации</b>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
        Текущие overrides: <code>{fmtOverrides(overrides)}</code>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <input
          type="text"
          placeholder="Имя варианта"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: "5px 8px",
            fontSize: 12,
            border: "1px solid #d1d5db",
            borderRadius: 4,
            width: 200,
            color: "#1f2937",
          }}
        />
        <input
          type="text"
          placeholder="Описание (необязательно)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          style={{
            padding: "5px 8px",
            fontSize: 12,
            border: "1px solid #d1d5db",
            borderRadius: 4,
            flex: 1,
            minWidth: 180,
            color: "#1f2937",
          }}
        />
        <button
          onClick={handleSave}
          disabled={busy || !name.trim()}
          style={{
            padding: "5px 12px",
            background: "#3b82f6",
            color: "#fff",
            border: 0,
            borderRadius: 4,
            cursor: busy || !name.trim() ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          💾 Сохранить
        </button>
      </div>

      {variants?.length > 0 ? (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            color: "#1f2937",
            marginBottom: 12,
          }}
        >
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th style={{ textAlign: "left", padding: "6px 10px" }}>Имя</th>
              <th style={{ textAlign: "left", padding: "6px 10px" }}>Параметры</th>
              <th style={{ textAlign: "left", padding: "6px 10px" }}>Описание</th>
              <th style={{ textAlign: "right", padding: "6px 10px" }}></th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.name} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{v.name}</td>
                <td style={{ padding: "6px 10px", color: "#6b7280" }}>
                  {fmtOverrides(v.overrides || {})}
                </td>
                <td style={{ padding: "6px 10px", color: "#6b7280" }}>
                  {v.description || "—"}
                </td>
                <td style={{ textAlign: "right", padding: "6px 10px" }}>
                  <button
                    onClick={() => onDelete(v.name)}
                    disabled={busy}
                    style={{
                      padding: "3px 8px",
                      background: "#fee2e2",
                      color: "#991b1b",
                      border: 0,
                      borderRadius: 4,
                      cursor: busy ? "not-allowed" : "pointer",
                      fontSize: 11,
                    }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
          Пока нет сохранённых вариантов. Загрузите сценарий, задайте отключения/этап
          и нажмите «Сохранить».
        </div>
      )}

      {variants?.length >= 2 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
            paddingTop: 8,
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <b style={{ fontSize: 12, color: "#111827" }}>Сравнить:</b>
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              border: "1px solid #d1d5db",
              borderRadius: 4,
              color: "#1f2937",
            }}
          >
            <option value="">A — выберите</option>
            {variants.map((v) => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
          <span style={{ color: "#6b7280" }}>vs</span>
          <select
            value={b}
            onChange={(e) => setB(e.target.value)}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              border: "1px solid #d1d5db",
              borderRadius: 4,
              color: "#1f2937",
            }}
          >
            <option value="">B — выберите</option>
            {variants.map((v) => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
          <button
            onClick={handleCompare}
            disabled={busy || !a || !b || a === b}
            style={{
              padding: "5px 12px",
              background: "#7c3aed",
              color: "#fff",
              border: 0,
              borderRadius: 4,
              cursor: busy || !a || !b || a === b ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            📊 Сравнить
          </button>
        </div>
      )}

      {compareResult && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <b style={{ color: "#5b21b6" }}>
              A: {compareResult.variant_a?.name} — B: {compareResult.variant_b?.name}
            </b>
            <button
              onClick={onClearCompare}
              style={{
                padding: "2px 8px",
                background: "transparent",
                border: "1px solid #c4b5fd",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
                color: "#5b21b6",
              }}
            >
              Скрыть
            </button>
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              color: "#1f2937",
            }}
          >
            <thead>
              <tr style={{ background: "#ede9fe", color: "#5b21b6" }}>
                <th style={{ textAlign: "left", padding: "5px 8px" }}>Клиент</th>
                <th style={{ textAlign: "right", padding: "5px 8px" }}>Δ доступность</th>
                <th style={{ textAlign: "right", padding: "5px 8px" }}>Δ макс. перерыв</th>
                <th style={{ textAlign: "right", padding: "5px 8px" }}>Δ ср. hops</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(compareResult.diff || {}).map(([id, d]) => (
                <tr key={id} style={{ borderTop: "1px solid #e9d5ff" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 600 }}>{id}</td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: d.path_pct >= 0 ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {d.path_pct >= 0 ? "+" : ""}
                    {d.path_pct?.toFixed(2)} п.п.
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: d.max_gap_s <= 0 ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {d.max_gap_s > 0 ? "+" : ""}
                    {d.max_gap_s} с
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: d.avg_hops <= 0 ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {d.avg_hops > 0 ? "+" : ""}
                    {d.avg_hops?.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}