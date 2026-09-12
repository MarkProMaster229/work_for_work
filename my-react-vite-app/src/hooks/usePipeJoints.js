import { useCallback, useEffect, useState } from 'react';

export function usePipeJoints() {
  const [joints, setJoints] = useState([]);
  const [jerked, setJerked] = useState(false);

  const build = useCallback(() => {
    const height = window.innerHeight;
    let spots = [0.18, 0.51, 0.86];
    if (Math.random() < 0.35) spots = [0.28, 0.74];
    setJoints(spots.map((s) => Math.round(height * s)));
  }, []);

  useEffect(() => {
    build();
    window.addEventListener('resize', build);
    return () => window.removeEventListener('resize', build);
  }, [build]);

  const jerk = useCallback(() => {
    setJerked(false);
    setTimeout(() => setJerked(true), 0);
  }, []);

  return { joints, jerked, jerk, clearJerk: () => setJerked(false) };
}