import { useState, useEffect } from 'react';

/**
 * Example custom hook - replace with real data hooks (e.g. useEmployees, useLeave)
 */
export function usePlaceholder(initialValue = null) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    const id = requestAnimationFrame(() => setValue(initialValue));
    return () => cancelAnimationFrame(id);
  }, [initialValue]);
  return [value, setValue];
}
