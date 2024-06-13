// This integration is ported from the Next.JS SDK.
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { httpIntegration as originalHttpIntegration } from '@sentry/node';
import type { IntegrationFn } from '@sentry/types';

class RemixHttpIntegration extends HttpInstrumentation {
  // Instead of the default behavior, we just don't do any wrapping for incoming requests
  protected _getPatchIncomingRequestFunction(_component: 'http' | 'https') {
    return (
      original: (event: string, ...args: unknown[]) => boolean,
    ): ((this: unknown, event: string, ...args: unknown[]) => boolean) => {
      return function incomingRequest(this: unknown, event: string, ...args: unknown[]): boolean {
        return original.apply(this, [event, ...args]);
      };
    };
  }
}

interface HttpOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
}

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = ((options: HttpOptions = {}) => {
  return originalHttpIntegration({
    ...options,
    _instrumentation: RemixHttpIntegration,
  });
}) satisfies IntegrationFn;
