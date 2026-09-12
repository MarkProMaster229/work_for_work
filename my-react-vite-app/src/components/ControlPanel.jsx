import React, { forwardRef, useRef } from "react";
import FrameDecoration from "./FrameDecoration";

const ControlPanel = forwardRef(function ControlPanel(
  {
    scenarioName,
    onScenarioFile,
    isLoading,
    onToggleLoading,
    onExport,
    exporting,
    onExportResult,
    exportingResult,
    onResetAll,
    resetting,
  },
  ref,
) {
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onScenarioFile(file);
    e.target.value = "";
  };

  return (
    <section className="card main-panel" ref={ref}>
      <div>
        <div className="mp-sign" id="sign">
          {scenarioName || "Название"}
        </div>
        <div className="mp-btns">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".json"
            onChange={handleChange}
          />
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            ⬆ Загрузить сценарий
          </button>
          <button className="btn" onClick={onExport} disabled={exporting}>
            {exporting ? "…" : "⬇ Выгрузить сценарий"}
          </button>
          <button
            className="btn"
            onClick={onExportResult}
            disabled={exportingResult}
          >
            {exportingResult ? "…" : "⬇ Выгрузить результат"}
          </button>
          <button
            className="btn"
            onClick={onResetAll}
            disabled={resetting}
            title="Сбросить все изменения и вернуться к исходному сценарию"
            style={{
              background: "#fee2e2",
              color: "#991b1b",
            }}
          >
            {resetting ? "…" : "↺ Сбросить всё"}
          </button>
          <button className="btn" onClick={onToggleLoading}>
            {isLoading ? "⏸ Хватит загружаться" : "▶ Тест загрузки"}
          </button>
        </div>
      </div>
      <FrameDecoration />
    </section>
  );
});

export default ControlPanel;