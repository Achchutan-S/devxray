import { useEffect, useState } from 'react';
import { CONFIG } from '@/utils/constants';

export function useDebounce<T>(value: T, delay: number = CONFIG.DEBOUNCE_DELAY): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
