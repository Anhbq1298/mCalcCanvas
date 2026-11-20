import { useEffect, useState } from 'react';

/** Phone-width layout (panels as drawers over the sheet, compact header). */
export const PHONE_QUERY = '(max-width: 767px)';

export const isPhone = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;

export function usePhone(): boolean {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
