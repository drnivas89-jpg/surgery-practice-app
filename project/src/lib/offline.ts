import { useEffect, useState } from 'react';

// Must match the runtimeCaching cacheName in vite.config.ts.
export const OFFLINE_DATA_CACHE = 'supabase-data';

/** Remove the on-device copy of patient data (called on sign-out). */
export async function clearOfflineData() {
  try {
    if ('caches' in window) await caches.delete(OFFLINE_DATA_CACHE);
  } catch {
    /* cache storage unavailable — nothing to clear */
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
