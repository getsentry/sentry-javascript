import type { ClientRequest, RequestOptions } from 'node:http';
import type { Span } from '@sentry/core';
import { URL_FULL } from '@sentry/conventions/attributes';
import {
  defineIntegration,
  getClient,
  hasSpansEnabled,
  hasSpanStreamingEnabled,
  stripDataUrlContent,
} from '@sentry/core';
import { getRequestUrlFromClientRequest } from '@sentry/core/server';
import type { NodeClient } from '../../sdk/client';
import type { HttpServerIntegrationOptions } from './httpServerIntegration';
import { httpServerIntegration } from './httpServerIntegration';
import type { HttpServerSpansIntegrationOptions } from './httpServerSpansIntegration';
import { httpServerSpansIntegration } from './httpServerSpansIntegration';
import type { OutgoingHttpRequestInstrumentationOptions } from './SentryHttpInstrumentation';
import { instrumentHttpOutgoingRequests } from './SentryHttpInstrumentation';

const INTEGRATION_NAME = 'Http' as const;

interface HttpOptions extends HttpServerIntegrationOptions, HttpServerSpansIntegrationOptions {
  /**
   * Whether breadcrumbs should be recorded for outgoing requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * If set to false, do not emit any spans.
   * This will ensure that the default HttpInstrumentation from OpenTelemetry is not setup,
   * only the Sentry-specific instrumentation for request isolation is applied.
   *
   * Defaults to `true` when tracing is enabled.
   */
  spans?: boolean;

  /**
   * Whether to inject trace propagation headers (sentry-trace, baggage, traceparent) into outgoing HTTP requests.
   *
   * When set to `false`, Sentry will not inject any trace propagation headers, but will still create breadcrumbs
   * (if `breadcrumbs` is enabled). This is useful when you run your own OpenTelemetry `HttpInstrumentation` and
   * want to avoid duplicate trace headers being injected by both Sentry and OpenTelemetry.
   *
   * @default `true`
   */
  tracePropagation?: boolean;

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
   * If true, do not generate spans for incoming requests at all.
   * This is used by Remix to avoid generating spans for incoming requests, as it generates its own spans.
   */
  disableIncomingRequestSpans?: boolean;

  /**
   * Called after an outgoing request span is created.
   * Only invoked when spans are created for outgoing requests.
   */
  outgoingRequestHook?: OutgoingHttpRequestInstrumentationOptions['outgoingRequestHook'];

  /**
   * Called when the outgoing request receives a response.
   * Only invoked when spans are created for outgoing requests.
   */
  outgoingResponseHook?: OutgoingHttpRequestInstrumentationOptions['outgoingResponseHook'];

  /**
   * Called when both the outgoing request and response are available.
   * Only invoked when spans are created for outgoing requests.
   */
  outgoingRequestApplyCustomAttributes?: OutgoingHttpRequestInstrumentationOptions['outgoingRequestApplyCustomAttributes'];
}

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = defineIntegration((options: HttpOptions = {}) => {
  const spans = options.spans ?? true;
  const enableServerSpans = spans && !options.disableIncomingRequestSpans;

  const server = httpServerIntegration(options);
  const serverSpans = httpServerSpansIntegration(options);

  return {
    name: INTEGRATION_NAME,
    setup(client: NodeClient) {
      const clientOptions = client.getOptions();

      if (enableServerSpans && hasSpansEnabled(clientOptions)) {
        serverSpans.setup(client);
      }
    },
    setupOnce() {
      server.setupOnce();

      const outgoingRequestOptions: OutgoingHttpRequestInstrumentationOptions = {
        breadcrumbs: options.breadcrumbs,
        spans,
        tracePropagation: options.tracePropagation ?? true,
        ignoreOutgoingRequests: options.ignoreOutgoingRequests,
        outgoingRequestHook: (span: Span, request: ClientRequest) => {
          // Sanitize data URLs to prevent long base64 strings in span attributes
          const url = getRequestUrlFromClientRequest(request);
          if (url.startsWith('data:')) {
            const sanitizedUrl = stripDataUrlContent(url);
            // With span streaming the span already carries a low-cardinality name, so it must not be
            // renamed back to something containing the URL.
            const client = getClient();
            if (!client || !hasSpanStreamingEnabled(client)) {
              span.updateName(`${request.method || 'GET'} ${sanitizedUrl}`);
            }
            span.setAttributes({
              [URL_FULL]: sanitizedUrl,
            });
          }
          options.outgoingRequestHook?.(span, request);
        },
        outgoingResponseHook: options.outgoingResponseHook,
        outgoingRequestApplyCustomAttributes: options.outgoingRequestApplyCustomAttributes,
      };

      // This is Sentry-specific instrumentation for outgoing request
      // breadcrumbs & trace propagation. It uses the diagnostic channels on
      // node versions that support it, falling back to monkey-patching when
      // needed.
      instrumentHttpOutgoingRequests(outgoingRequestOptions);
    },
    processEvent(event) {
      // Always run this, even if spans are disabled
      // The reason being that e.g. the remix integration disables span
      // creation here but still wants to use the ignore status codes option
      return serverSpans.processEvent(event);
    },
  };
});
