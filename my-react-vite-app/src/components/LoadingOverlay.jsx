import React from 'react';

export default function LoadingOverlay({ visible, onClose }) {
  return (
    <div id="loadOvl" className={visible ? 'show' : ''} onClick={onClose}>
      <div className="frame">
        <img id="loadImg" src="sprites/loading.gif" alt="Загрузка" />
      </div>
      <div className="lt">ЗАГРУЗКА ДАННЫХ…</div>
    </div>
  );
}