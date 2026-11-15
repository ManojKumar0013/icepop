import { useEffect, useState } from "react";
import { storefrontApi } from "./api";

const LOAD_BUDGET = 90000;
const REQUEST_TIMEOUT = 30000;
const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504]);

export function useStorefrontData(path, { list = true, debounce = 0 } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let startedAt;

    const load = async (retryDelay) => {
      startedAt ??= Date.now();
      const timeLeft = LOAD_BUDGET - (Date.now() - startedAt);
      if (timeLeft <= 0) {
        setResult({ path, attempt, data: null, error: true });
        return;
      }

      let retryable = true;
      try {
        const { data } = await storefrontApi.get(path, { signal, timeout: Math.min(REQUEST_TIMEOUT, timeLeft) });
        const valid = list ? Array.isArray(data) : data && typeof data === "object" && !Array.isArray(data);
        if (valid) {
          if (!signal.aborted) setResult({ path, attempt, data, error: false });
          return;
        }
        // A hosting splash page can arrive as HTML with a successful HTTP status.
      } catch (error) {
        retryable = !error.response || RETRYABLE_STATUS.has(error.response.status);
      }

      if (signal.aborted) return;
      if (retryable && LOAD_BUDGET - (Date.now() - startedAt) > retryDelay) {
        timer = setTimeout(() => load(Math.min(retryDelay * 2, 10000)), retryDelay);
      } else {
        setResult({ path, attempt, data: null, error: true });
      }
    };

    let timer = setTimeout(() => load(1000), debounce);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, list, debounce, attempt]);

  const current = result?.path === path && result.attempt === attempt ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? false,
    retry: () => setAttempt((previous) => previous + 1),
  };
}
