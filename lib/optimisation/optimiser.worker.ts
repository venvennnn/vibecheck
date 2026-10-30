/// <reference lib="webworker" />
import { optimise, type OptimiseInput, type OptimiseResult } from "./optimise";

type RequestMessage = { id: string; input: OptimiseInput };
type ResponseMessage = { id: string; result?: OptimiseResult; error?: string };

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const { id, input } = event.data;
  try {
    const result = optimise(input);
    const message: ResponseMessage = { id, result };
    self.postMessage(message);
  } catch (error) {
    const message: ResponseMessage = {
      id,
      error: error instanceof Error ? error.message : "Optimiser failed.",
    };
    self.postMessage(message);
  }
};
