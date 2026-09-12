import React, { forwardRef } from 'react';
import FrameDecoration from './FrameDecoration';

const KpiPanel = forwardRef(function KpiPanel({ kpi }, ref) {
  return (
    <section className="card nal-cream" ref={ref}>
      <div className="kpi-grid">
        <div className="kpi-cell">
          <div className="k-l">Доступность · мин. по пунктам</div>
          <div className="k-v">{kpi.minAvailability}</div>
        </div>
        <div className="kpi-cell">
          <div className="k-l">Доступность · средняя</div>
          <div className="k-v">{kpi.avgAvailability}</div>
        </div>
        <div className="kpi-cell">
          <div className="k-l">Макс. перерыв связи</div>
          <div className="k-v">{kpi.maxBreak}</div>
        </div>
        <div className="kpi-cell">
          <div className="k-l">Активные КА сейчас</div>
          <div className="k-v">{kpi.activeKA}</div>
        </div>
      </div>
      <FrameDecoration />
    </section>
  );
});

export default KpiPanel;