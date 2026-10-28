export function createRequestSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

export function mapRequestError(error: unknown, signal?: AbortSignal): Error {
  const reason = signal?.aborted ? signal.reason : error;
  if (reason instanceof DOMException && reason.name === "TimeoutError") return new Error("TIMEOUT");
  if (reason instanceof DOMException && reason.name === "AbortError") return new Error("ABORTED");
  if (error instanceof DOMException && error.name === "TimeoutError") return new Error("TIMEOUT");
  return new Error("NETWORK");
}
