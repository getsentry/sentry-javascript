/** The status of an event. */
export enum SendStatus {
  /** The status could not be determined. */
  Unknown = 'unknown',
  /** The event was skipped due to configuration or callbacks. */
  Skipped = 'skipped',
  /** The event was sent to Sentry successfully. */
  Success = 'success',
  /** The client is currently rate limited and will try again later. */
  RateLimit = 'rate_limit',
  /** The event could not be processed. */
  Invalid = 'invalid',
  /** A server-side error ocurred during submission. */
  Failed = 'failed',
}

// tslint:disable:no-unnecessary-qualifier no-namespace
export namespace SendStatus {
  /**
   * Converts a HTTP status code into a {@link SendStatus}.
   *
   * @param code The HTTP response status code.
   * @returns The send status or {@link SendStatus.Unknown}.
   */
  export function fromHttpCode(code: number): SendStatus {
    if (code >= 200 && code < 300) {
      return SendStatus.Success;
    }

    if (code === 429) {
      return SendStatus.RateLimit;
    }

    if (code >= 400 && code < 500) {
      return SendStatus.Invalid;
    }

    if (code >= 500) {
      return SendStatus.Failed;
    }

    return SendStatus.Unknown;
  }
}
