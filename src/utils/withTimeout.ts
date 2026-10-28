export function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
