import React from 'react';

const PIECES = ['c-tl', 'c-tr', 'c-bl', 'c-br', 'e-t', 'e-b', 'e-l', 'e-r', 'crest'];

export default function FrameDecoration() {
  return (
    <div className="nz">
      {PIECES.map((name) => (
        <i key={name} data-k={name} />
      ))}
    </div>
  );
}