let isDevServer = false;

/**
 * Marks this process as the dev server, which passes each request on to Nitro in a worker that traces it.
 */
export function setIsNitroDevServer(): void {
  isDevServer = true;
}

/**
 * Whether this process is the dev server, see {@link setIsNitroDevServer}.
 */
export function isNitroDevServer(): boolean {
  return isDevServer;
}
