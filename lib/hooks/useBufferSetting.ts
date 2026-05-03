// バッファ (m) を SQLite settings テーブルに保存して再起動後も保持する。

import { useEffect, useState } from 'react';

import { DEFAULT_BUFFER_M, MAX_BUFFER_M, MIN_BUFFER_M } from '../constants';
import { getSetting, putSetting } from '../db';

const KEY = 'buffer_m';

export function useBufferSetting(): {
  bufferM: number;
  setBufferM: (v: number) => void;
} {
  const [bufferM, setLocal] = useState<number>(DEFAULT_BUFFER_M);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getSetting(KEY);
        if (!cancelled && v) {
          const n = Number(v);
          if (Number.isFinite(n)) setLocal(clamp(n));
        }
      } catch (e) {
        console.warn('[buffer] load failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setBufferM = (v: number) => {
    const c = clamp(v);
    setLocal(c);
    putSetting(KEY, String(c)).catch((e) =>
      console.warn('[buffer] save failed', e),
    );
  };

  return { bufferM, setBufferM };
}

function clamp(v: number): number {
  return Math.min(MAX_BUFFER_M, Math.max(MIN_BUFFER_M, Math.round(v)));
}
