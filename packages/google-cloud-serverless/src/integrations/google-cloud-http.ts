import type * as common from '@google-cloud/common';
import { HTTP_REQUEST_METHOD, SENTRY_OP, SERVER_ADDRESS, URL_DOMAIN, URL_FULL } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import type { Client, IntegrationFn } from '@sentry/core';
import {
  defineIntegration,
  fill,
  getClient,
  hasSpanStreamingEnabled,
  isURLObjectRelative,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  filterCollectedUrl,
  stripUrlQueryAndFragment,
} from '@sentry/core';
import { startInactiveSpan } from '@sentry/node';

type RequestOptions = common.DecorateRequestOptions;
type ResponseCallback = common.BodyResponseCallback;
// This interace could be replaced with just type alias once the `strictBindCallApply` mode is enabled.
interface RequestFunction extends CallableFunction {
  (reqOpts: RequestOptions, callback: ResponseCallback): void;
}

const INTEGRATION_NAME = 'GoogleCloudHttp' as const;

const SETUP_CLIENTS = new WeakMap<Client, boolean>();

const _googleCloudHttpIntegration = ((options: { optional?: boolean } = {}) => {
  const optional = options.optional || false;
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const commonModule = require('@google-cloud/common') as typeof common;
        fill(commonModule.Service.prototype, 'request', wrapRequestFunction);
      } catch (e) {
        if (!optional) {
          throw e;
        }
      }
    },
    setup(client) {
      SETUP_CLIENTS.set(client, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Google Cloud Platform service requests tracking for RESTful APIs.
 */
export const googleCloudHttpIntegration = defineIntegration(_googleCloudHttpIntegration);

/** Returns a wrapped function that makes a request with tracing enabled */
function wrapRequestFunction(orig: RequestFunction): RequestFunction {
  return function (this: common.Service, reqOpts: RequestOptions, callback: ResponseCallback): void {
    const httpMethod = reqOpts.method || 'GET';
    const client = getClient();
    const serverAddress = getServerAddress(this.apiEndpoint);
    // Span names must not contain a query string, and callers can pass any URI they want. With span
    // streaming they have to be low cardinality on top of that, so the URI is dropped entirely and only
    // the API endpoint is kept — `reqOpts.uri` is a path with no route to parameterize.
    const streamedName = serverAddress ? `${httpMethod} ${serverAddress}` : httpMethod;
    const span = SETUP_CLIENTS.has(client as Client)
      ? startInactiveSpan({
          name:
            !!client && hasSpanStreamingEnabled(client)
              ? streamedName
              : `${httpMethod} ${stripUrlQueryAndFragment(reqOpts.uri)}`,
          onlyIfParent: true,
          attributes: {
            [SENTRY_OP]: HTTP_CLIENT,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.serverless',
            [HTTP_REQUEST_METHOD]: httpMethod,
            [SERVER_ADDRESS]: serverAddress,
            [URL_DOMAIN]: serverAddress,
            [URL_FULL]: filterCollectedUrl(reqOpts.uri),
          },
        })
      : new SentryNonRecordingSpan();
    orig.call(this, reqOpts, (...args: Parameters<ResponseCallback>) => {
      span.end();
      callback(...args);
    });
  };
}

/** Extracts the host of the API endpoint the request is sent to */
function getServerAddress(apiEndpoint: string): string {
  const url = parseStringToURLObject(apiEndpoint);
  return url && !isURLObjectRelative(url) ? url.host : apiEndpoint;
}
