import React, { useMemo } from "react";

const ROLE_LABEL = {
  client: "клиент",
  gateway: "шлюз",
};

function distribution(items, key) {
  const map = {};
  for (const it of items) {
    const k = it[key];
    map[k] = (map[k] || 0) + 1;
  }
  return map;
}

function NumberLine({ label, value, unit }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
        fontSize: 12,
      }}
    >
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ color: "#1f2937", fontWeight: 600 }}>
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

export default function ConstellationPanel({ scenario }) {
  const s = scenario?.effective_scenario || scenario;

  const {
    planes = [],
    satellites = [],
    launch_stage,
  } = s?.design || {};

  const env = s?.environment || {};
  const ground = s?.ground_sites || [];

  const clients = ground.filter((g) => g.role === "client");
  const gateways = ground.filter((g) => g.role === "gateway");

  const batchDist = useMemo(() => distribution(satellites, "launch_batch"), [satellites]);
  const planeDist = useMemo(() => distribution(satellites, "plane_id"), [satellites]);

  const satPerPlane = useMemo(() => {
    const map = {};
    for (const sat of satellites) {
      const pid = sat.plane_id;
      if (!map[pid]) map[pid] = { total: 0, batches: {} };
      map[pid].total += 1;
      const b = sat.launch_batch;
      map[pid].batches[b] = (map[pid].batches[b] || 0) + 1;
    }
    return map;
  }, [satellites]);

  if (!s) {
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
        Сценарий не загружен.
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
        display: "grid",
        gridTemplateColumns: "minmax(260px, 1fr) minmax(260px, 1fr) minmax(320px, 1.4fr)",
        gap: 16,
      }}
    >
      {/* --- Состав --- */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
          Состав группировки
        </div>
        <NumberLine label="Плоскостей" value={planes.length} />
        <NumberLine label="Спутников всего" value={satellites.length} />
        <NumberLine
          label="Активных на этапе"
          value={
            satellites.filter(
              (x) => launch_stage == null || x.launch_batch <= launch_stage,
            ).length
          }
        />
        <NumberLine label="Очередей" value={Object.keys(batchDist).length || 0} />
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            background: "#f3f4f6",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          <div style={{ color: "#6b7280", marginBottom: 4 }}>
            Распределение по очередям:
          </div>
          {Object.keys(batchDist)
            .sort()
            .map((b) => (
              <div key={b} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ width: 70, color: "#374151" }}>
                  Очередь {b}:
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    background: "#e5e7eb",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(batchDist[b] / satellites.length) * 100}%`,
                      height: "100%",
                      background: ["#3b82f6", "#8b5cf6", "#f59e0b"][Number(b) - 1] || "#6b7280",
                    }}
                  />
                </div>
                <span style={{ width: 30, textAlign: "right", color: "#1f2937", fontWeight: 600 }}>
                  {batchDist[b]}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* --- Параметры расчёта --- */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
          Параметры расчёта
        </div>
        <NumberLine label="Высота орбиты" value={env.altitude_km} unit="км" />
        <NumberLine label="Наклонение" value={env.inclination_deg} unit="°" />
        <NumberLine
          label="Горизонт"
          value={env.horizon_s != null ? (env.horizon_s / 3600).toFixed(1) : "—"}
          unit="ч"
        />
        <NumberLine label="Шаг" value={env.step_s} unit="с" />
        <NumberLine
          label="Мин. угол места"
          value={env.min_elevation_deg}
          unit="°"
        />
        <NumberLine label="Дальность ISL" value={env.isl_range_km} unit="км" />
        <NumberLine
          label="Целевой ориентир"
          value={
            env.target_availability != null
              ? (env.target_availability * 100).toFixed(0)
              : "—"
          }
          unit="%"
        />
      </div>

      {/* --- Плоскости и станции --- */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
          Плоскости и наземные пункты
        </div>

        <div style={{ maxHeight: 220, overflow: "auto", marginBottom: 8 }}>
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
                <th style={{ textAlign: "left", padding: "4px 8px" }}>ID</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>RAAN,°</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Фаза,°</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>КА</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>по очер.</th>
              </tr>
            </thead>
            <tbody>
              {planes.map((p) => {
                const info = satPerPlane[p.id] || { total: 0, batches: {} };
                const perBatch = Object.keys(info.batches)
                  .sort()
                  .map((b) => `${b}:${info.batches[b]}`)
                  .join(" ");
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "3px 8px", fontWeight: 600 }}>{p.id}</td>
                    <td style={{ textAlign: "right", padding: "3px 8px" }}>
                      {p.raan_deg}
                    </td>
                    <td style={{ textAlign: "right", padding: "3px 8px" }}>
                      {p.phase_deg}
                    </td>
                    <td style={{ textAlign: "right", padding: "3px 8px" }}>
                      {info.total}
                    </td>
                    <td style={{ padding: "3px 8px", color: "#6b7280" }}>
                      {perBatch || "—"}
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
            gap: 12,
            fontSize: 12,
            color: "#374151",
          }}
        >
          <div>
            <b style={{ color: "#1f2937" }}>Клиенты ({clients.length}):</b>{" "}
            {clients.map((c) => c.id).join(", ") || "—"}
          </div>
          <div>
            <b style={{ color: "#1f2937" }}>Шлюзы ({gateways.length}):</b>{" "}
            {gateways.map((g) => g.id).join(", ") || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}