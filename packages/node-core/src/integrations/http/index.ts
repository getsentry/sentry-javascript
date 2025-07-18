import type { IncomingMessage, RequestOptions } from 'node:http';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '../../otel/instrument';
import type { SentryHttpInstrumentationOptions } from './SentryHttpInstrumentation';
import { SentryHttpInstrumentation } from './SentryHttpInstrumentation';

const INTEGRATION_NAME = 'Http';

interface HttpOptions {
  /**
   * Whether breadcrumbs should be recorded for outgoing requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for incoming requests to track the health and crash-free rate of your releases in Sentry.
   * Read more about Release Health: https://docs.sentry.io/product/releases/health/
   *
   * Defaults to `true`.
   */
  trackIncomingRequestsAsSessions?: boolean;

  /**
   * Number of milliseconds until sessions tracked with `trackIncomingRequestsAsSessions` will be flushed as a session aggregate.
   *
   * Defaults to `60000` (60s).
   */
  sessionFlushingDelayMS?: number;

  /**
   * Do not capture spans or breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   *
   * The `url` param contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * For example: `'https://someService.com/users/details?id=123'`
   *
   * The `request` param contains the original {@type RequestOptions} object used to make the outgoing request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;

  /**
   * Do not capture spans for incoming HTTP requests to URLs where the given callback returns `true`.
   * Spans will be non recording if tracing is disabled.
   *
   * The `urlPath` param consists of the URL path and query string (if any) of the incoming request.
   * For example: `'/users/details?id=123'`
   *
   * The `request` param contains the original {@type IncomingMessage} object of the incoming request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreIncomingRequests?: (urlPath: string, request: IncomingMessage) => boolean;

  /**
   * Do not capture spans for incoming HTTP requests with the given status codes.
   * By default, spans with 404 status code are ignored.
   * Expects an array of status codes or a range of status codes, e.g. [[300,399], 404] would ignore 3xx and 404 status codes.
   *
   * @default `[[401, 404], [300, 399]]`
   */
  dropSpansForIncomingRequestStatusCodes?: (number | [number, number])[];

  /**
   * Do not capture the request body for incoming HTTP requests to URLs where the given callback returns `true`.
   * This can be useful for long running requests where the body is not needed and we want to avoid capturing it.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the incoming request.
   * @param request Contains the {@type RequestOptions} object used to make the incoming request.
   */
  ignoreIncomingRequestBody?: (url: string, request: RequestOptions) => boolean;

  /**
   * Controls the maximum size of incoming HTTP request bodies attached to events.
   *
   * Available options:
   * - 'none': No request bodies will be attached
   * - 'small': Request bodies up to 1,000 bytes will be attached
   * - 'medium': Request bodies up to 10,000 bytes will be attached (default)
   * - 'always': Request bodies will always be attached
   *
   * Note that even with 'always' setting, bodies exceeding 1MB will never be attached
   * for performance and security reasons.
   *
   * @default 'medium'
   */
  maxIncomingRequestBodySize?: 'none' | 'small' | 'medium' | 'always';

  /**
   * If true, do not generate spans for incoming requests at all.
   * This is used by Remix to avoid generating spans for incoming requests, as it generates its own spans.
   */
  disableIncomingRequestSpans?: boolean;
}

const instrumentSentryHttp = generateInstrumentOnce<SentryHttpInstrumentationOptions>(
  `${INTEGRATION_NAME}.sentry`,
  options => {
    return new SentryHttpInstrumentation(options);
  },
);

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = defineIntegration((options: HttpOptions = {}) => {
  const dropSpansForIncomingRequestStatusCodes = options.dropSpansForIncomingRequestStatusCodes ?? [
    [401, 404],
    [300, 399],
  ];

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentSentryHttp({
        ...options,
        extractIncomingTraceFromHeader: true,
        propagateTraceInOutgoingRequests: true,
      });
    },
    processEvent(event) {
      // Drop transaction if it has a status code that should be ignored
      if (event.type === 'transaction') {
        const statusCode = event.contexts?.trace?.data?.['http.response.status_code'];
        if (
          typeof statusCode === 'number' &&
          dropSpansForIncomingRequestStatusCodes.some(code => {
            if (typeof code === 'number') {
              return code === statusCode;
            }

            const [min, max] = code;
            return statusCode >= min && statusCode <= max;
          })
        ) {
          return null;
        }
      }

      return event;
    },
  };
});
