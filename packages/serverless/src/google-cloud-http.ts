import type * as common from '@google-cloud/common';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  convertIntegrationFnToClass,
  defineIntegration,
  getClient,
} from '@sentry/core';
import { startInactiveSpan } from '@sentry/node';
import type { Client, Integration, IntegrationClass, IntegrationFn } from '@sentry/types';
import { fill } from '@sentry/utils';

type RequestOptions = common.DecorateRequestOptions;
type ResponseCallback = common.BodyResponseCallback;
// This interace could be replaced with just type alias once the `strictBindCallApply` mode is enabled.
interface RequestFunction extends CallableFunction {
  (reqOpts: RequestOptions, callback: ResponseCallback): void;
}

const INTEGRATION_NAME = 'GoogleCloudHttp';

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

export const googleCloudHttpIntegration = defineIntegration(_googleCloudHttpIntegration);

/**
 * Google Cloud Platform service requests tracking for RESTful APIs.
 *
 * @deprecated Use `googleCloudHttpIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const GoogleCloudHttp = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  googleCloudHttpIntegration,
) as IntegrationClass<Integration>;

// eslint-disable-next-line deprecation/deprecation
export type GoogleCloudHttp = typeof GoogleCloudHttp;

/** Returns a wrapped function that makes a request with tracing enabled */
function wrapRequestFunction(orig: RequestFunction): RequestFunction {
  return function (this: common.Service, reqOpts: RequestOptions, callback: ResponseCallback): void {
    const httpMethod = reqOpts.method || 'GET';
    const span = SETUP_CLIENTS.has(getClient() as Client)
      ? startInactiveSpan({
          name: `${httpMethod} ${reqOpts.uri}`,
          op: `http.client.${identifyService(this.apiEndpoint)}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.serverless',
          },
        })
      : undefined;
    orig.call(this, reqOpts, (...args: Parameters<ResponseCallback>) => {
      if (span) {
        span.end();
      }
      callback(...args);
    });
  };
}

/** Identifies service by its base url */
function identifyService(apiEndpoint: string): string {
  const match = apiEndpoint.match(/^https:\/\/(\w+)\.googleapis.com$/);
  return match ? match[1] : apiEndpoint.replace(/^(http|https)?:\/\//, '');
}
