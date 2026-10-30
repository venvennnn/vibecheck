"use client";

import { useCallback, useEffect, useRef } from "react";
import { optimise, type OptimiseInput, type OptimiseResult } from "@/lib/optimisation/optimise";

export function useOptimiser() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      workerRef.current = new Worker(new URL("../../lib/optimisation/optimiser.worker.ts", import.meta.url));
    } catch {
      workerRef.current = null;
    }
    return () => workerRef.current?.terminate();
  }, []);

  return useCallback((input: OptimiseInput) => {
    const worker = workerRef.current;
    if (!worker) return Promise.resolve(optimise(input));
    return new Promise<OptimiseResult>((resolve) => {
      const id = crypto.randomUUID();
      const finish = (result: OptimiseResult) => {
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        resolve(result);
      };
      const onMessage = (event: MessageEvent<{ id: string; result?: OptimiseResult }>) => {
        if (event.data?.id !== id) return;
        finish(event.data.result ?? optimise(input));
      };
      const timer = window.setTimeout(() => finish(optimise(input)), 2000);
      worker.addEventListener("message", onMessage);
      try {
        worker.postMessage({ id, input });
      } catch {
        finish(optimise(input));
      }
    });
  }, []);
}
