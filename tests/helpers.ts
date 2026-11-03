/** Polls until `predicate` is true. Fails with `describe()` in the message on timeout. */
export async function waitFor(
  predicate: () => boolean,
  describe: () => string = () => '',
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out. ${describe()}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
