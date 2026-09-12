import React from 'react';

export default function PipeDecoration({ joints, jerked, onClick, onAnimationEnd }) {
  return (
    <div
      id="pipe"
      title="Газовая труба · можно дёрнуть"
      className={jerked ? 'jerk' : ''}
      onClick={onClick}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="pipe-body" />
      {joints.map((top, idx) => (
        <i key={idx} className="pipe-joint" style={{ top: `${top}px` }} />
      ))}
    </div>
  );
}