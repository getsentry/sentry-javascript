import { TERMINAL_POLL_STATUSES } from './constants';

export class ExtensionsApiError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ExtensionsApiError';
  }
}

/**
 * A registration the Extensions API answered and will not answer differently. It documents 400,
 * 403 and 500 for `/register`, the request body is a compile-time constant, and a registration it
 * accepted without handing back an identifier leaves nothing to poll with. Retrying any of those
 * is worse than failing: the init phase is gated on every extension Lambda launched, so a process
 * that never registers holds each invocation to the function timeout with the handler never
 * running, where crashing costs one fast invocation and a fresh environment.
 * https://docs.aws.amazon.com/lambda/latest/dg/runtimes-extensions-api.html#extensions-registration-api-a
 */
export class PermanentRegistrationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermanentRegistrationError';
  }
}

/** Structural rather than `instanceof`, so it holds for an error that crossed a module boundary. */
export function isTerminalPollStatus(err: unknown): boolean {
  const statusCode = (err as { statusCode?: unknown } | null)?.statusCode;

  return typeof statusCode === 'number' && TERMINAL_POLL_STATUSES.includes(statusCode);
}
