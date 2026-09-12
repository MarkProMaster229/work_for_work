import React from 'react';

export default function ErrorBanner({ message, onClose }) {
  if (!message) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      right: '16px',
      background: '#fee2e2',
      color: '#991b1b',
      padding: '10px 14px',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1000,
      fontSize: '13px',
      maxWidth: '360px',
    }}>
      {message}
      <button
        onClick={onClose}
        style={{
          marginLeft: '12px',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          color: '#991b1b',
          fontWeight: 'bold',
        }}
      >
        ✕
      </button>
    </div>
  );
}