"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True after hydration; false during server render and the first client render. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
