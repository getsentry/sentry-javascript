import { defineIntegration } from '../integration';
import type { Event } from '../types-hoist/event';
import type { IntegrationFn } from '../types-hoist/integration';
import type { RequestEventData } from '../types-hoist/request';
import { parseCookie } from '../utils/cookie';
import { getClientIPAddress, ipHeaderNames } from '../vendor/getIpAddress';

interface RequestDataIncludeOptions {
  cookies?: boolean;
  data?: boolean;
  headers?: boolean;
  ip?: boolean;
  query_string?: boolean;
  url?: boolean;
}

type RequestDataIntegrationOptions = {
  /**
   * Controls what data is pulled from the request and added to the event.
   */
  include?: RequestDataIncludeOptions;
};

// TODO(v11): Change defaults based on `sendDefaultPii`
const DEFAULT_INCLUDE: RequestDataIncludeOptions = {
  cookies: true,
  data: true,
  headers: true,
  query_string: true,
  url: true,
};

const INTEGRATION_NAME = 'RequestData';

const _requestDataIntegration = ((options: RequestDataIntegrationOptions = {}) => {
  const include = {
    ...DEFAULT_INCLUDE,
    ...options.include,
  };

  return {
    name: INTEGRATION_NAME,
    processEvent(event, _hint, client) {
      const { sdkProcessingMetadata = {} } = event;
      const { normalizedRequest, ipAddress } = sdkProcessingMetadata;

      const includeWithDefaultPiiApplied: RequestDataIncludeOptions = {
        ...include,
        ip: include.ip ?? client.getOptions().sendDefaultPii,
      };

      if (normalizedRequest) {
        addNormalizedRequestDataToEvent(event, normalizedRequest, { ipAddress }, includeWithDefaultPiiApplied);
      }

      return event;
    },
  };
}) satisfies IntegrationFn;

/**
 * Add data about a request to an event. Primarily for use in Node-based SDKs, but included in `@sentry/core`
 * so it can be used in cross-platform SDKs like `@sentry/nextjs`.
 */
export const requestDataIntegration = defineIntegration(_requestDataIntegration);

/**
 * Add already normalized request data to an event.
 * This mutates the passed in event.
 */
function addNormalizedRequestDataToEvent(
  event: Event,
  req: RequestEventData,
  // Data that should not go into `event.request` but is somehow related to requests
  additionalData: { ipAddress?: string },
  include: RequestDataIncludeOptions,
): void {
  event.request = {
    ...event.request,
    ...extractNormalizedRequestData(req, include),
  };

  if (include.ip) {
    const ip = (req.headers && getClientIPAddress(req.headers)) || additionalData.ipAddress;
    if (ip) {
      event.user = {
        ...event.user,
        ip_address: ip,
      };
    }
  }
}

function extractNormalizedRequestData(
  normalizedRequest: RequestEventData,
  include: RequestDataIncludeOptions,
): RequestEventData {
  const requestData: RequestEventData = {};
  const headers = { ...normalizedRequest.headers };

  if (include.headers) {
    requestData.headers = headers;

    // Remove the Cookie header in case cookie data should not be included in the event
    if (!include.cookies) {
      delete (headers as { cookie?: string }).cookie;
    }

    // Remove IP headers in case IP data should not be included in the event
    if (!include.ip) {
      ipHeaderNames.forEach(ipHeaderName => {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (headers as Record<string, unknown>)[ipHeaderName];
      });
    }
  }

  requestData.method = normalizedRequest.method;

  if (include.url) {
    requestData.url = normalizedRequest.url;
  }

  if (include.cookies) {
    const cookies = normalizedRequest.cookies || (headers?.cookie ? parseCookie(headers.cookie) : undefined);
    requestData.cookies = cookies || {};
  }

  if (include.query_string) {
    requestData.query_string = normalizedRequest.query_string;
  }

  if (include.data) {
    requestData.data = normalizedRequest.data;
  }

  return requestData;
}
