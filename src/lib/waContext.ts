import { useEffect, useSyncExternalStore } from "react";

// Page-provided WhatsApp pre-fill for the floating button; cleared when the page unmounts.
let current: string | null = null;
const listeners = new Set<() => void>();
const set = (m: string | null) => { current = m; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useWaContext(message: string | null) {
  useEffect(() => { set(message); return () => set(null); }, [message]);
}
export const useCurrentWa = () => useSyncExternalStore(subscribe, () => current, () => null);
