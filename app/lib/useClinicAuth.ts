'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { AUTH_STORAGE_KEY, readClinicAuth } from './clinicAuth';

const subscribe = (notify: () => void) => {
  window.addEventListener('storage', notify);
  window.addEventListener('clinic-auth-changed', notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener('clinic-auth-changed', notify);
  };
};

export const useClinicAuth = () => {
  const raw = useSyncExternalStore(
    subscribe,
    () => window.sessionStorage.getItem(AUTH_STORAGE_KEY),
    () => null,
  );
  return useMemo(() => raw ? readClinicAuth() : null, [raw]);
};
