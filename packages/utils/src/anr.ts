/**
 * A node.js watchdog timer
 * @param pollInterval The interval that we expect to get polled at
 * @param anrThreshold The threshold for when we consider ANR
 * @param callback The callback to call for ANR
 * @returns
 */
export function watchdogTimer(pollInterval: number, anrThreshold: number, callback: () => void): () => void {
  let lastPoll = process.hrtime();
  let triggered = false;

  setInterval(() => {
    const [seconds, nanoSeconds] = process.hrtime(lastPoll);
    const diffMs = Math.floor(seconds * 1e3 + nanoSeconds / 1e6);

    if (!triggered && diffMs > pollInterval + anrThreshold) {
      triggered = true;
      callback();
    }

    if (diffMs < pollInterval + anrThreshold) {
      triggered = false;
    }
  }, 20);

  return () => {
    lastPoll = process.hrtime();
  };
}
