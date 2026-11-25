interface NitroLike {
  options?: { devServer?: { runner?: string } };
}

/**
 * Whether Nitro runs the app in a worker for this dev server. The `self` runner runs it in the dev server's
 * process instead, so its requests must still be traced there.
 */
export function runsNitroInWorker(nitro: NitroLike | undefined): boolean {
  const runner = nitro?.options?.devServer?.runner || process.env.NITRO_DEV_RUNNER || 'node-worker';
  return runner === 'node-worker' || runner === 'node-process';
}
