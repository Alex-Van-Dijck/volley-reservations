import { useEffect, useState } from "react";
import { errorMessage } from "./format";

type LoadState<T> = { data: T | null; error: string | null; loading: boolean };

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: errorMessage(e), loading: false }));
    return () => {
      alive = false;
    };
    // fn is recreated on every render, callers pass the values it depends on in deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
