import type { IntegrationFn } from '@sentry/types';
import type { AddRequestDataToEventOptions, TransactionNamingScheme } from '@sentry/utils';
import { addNormalizedRequestDataToEvent } from '@sentry/utils';
import { addRequestDataToEvent } from '@sentry/utils';
import { defineIntegration } from '../integration';

export type RequestDataIntegrationOptions = {
  /**
   * Controls what data is pulled from the request and added to the event
   */
  include?: {
    cookies?: boolean;
    data?: boolean;
    headers?: boolean;
    ip?: boolean;
    query_string?: boolean;
    url?: boolean;
    user?:
      | boolean
      | {
          id?: boolean;
          username?: boolean;
          email?: boolean;
        };
  };

  /** Whether to identify transactions by parameterized path, parameterized path with method, or handler name */
  transactionNamingScheme?: TransactionNamingScheme;
};

const DEFAULT_OPTIONS = {
  include: {
    cookies: true,
    data: true,
    headers: true,
    ip: false,
    query_string: true,
    url: true,
    user: {
      id: true,
      username: true,
      email: true,
    },
  },
  transactionNamingScheme: 'methodPath' as const,
};

const INTEGRATION_NAME = 'RequestData';

const _requestDataIntegration = ((options: RequestDataIntegrationOptions = {}) => {
  const _options: Required<RequestDataIntegrationOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    include: {
      ...DEFAULT_OPTIONS.include,
      ...options.include,
      user:
        options.include && typeof options.include.user === 'boolean'
          ? options.include.user
          : {
              ...DEFAULT_OPTIONS.include.user,
              // Unclear why TS still thinks `options.include.user` could be a boolean at this point
              ...((options.include || {}).user as Record<string, boolean>),
            },
    },
  };

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      // Note: In the long run, most of the logic here should probably move into the request data utility functions. For
      // the moment it lives here, though, until https://github.com/getsentry/sentry-javascript/issues/5718 is addressed.
      // (TL;DR: Those functions touch many parts of the repo in many different ways, and need to be cleaned up. Once
      // that's happened, it will be easier to add this logic in without worrying about unexpected side effects.)

      const { sdkProcessingMetadata = {} } = event;
      const { request, normalizedRequest } = sdkProcessingMetadata;

      const addRequestDataOptions = convertReqDataIntegrationOptsToAddReqDataOpts(_options);

      // If this is set, it takes precedence over the plain request object
      if (normalizedRequest) {
        // Some other data is not available in standard HTTP requests, but can sometimes be augmented by e.g. Express or Next.js
        const ipAddress = request ? request.ip || (request.socket && request.socket.remoteAddress) : undefined;
        const user = request ? request.user : undefined;

        addNormalizedRequestDataToEvent(event, normalizedRequest, { ipAddress, user }, addRequestDataOptions);
        return event;
      }

      // TODO(v9): Eventually we can remove this fallback branch and only rely on the normalizedRequest above
      if (!request) {
        return event;
      }

      return addRequestDataToEvent(event, request, addRequestDataOptions);
    },
  };
}) satisfies IntegrationFn;

/**
 * Add data about a request to an event. Primarily for use in Node-based SDKs, but included in `@sentry/core`
 * so it can be used in cross-platform SDKs like `@sentry/nextjs`.
 */
export const requestDataIntegration = defineIntegration(_requestDataIntegration);

/** Convert this integration's options to match what `addRequestDataToEvent` expects */
/** TODO: Can possibly be deleted once https://github.com/getsentry/sentry-javascript/issues/5718 is fixed */
function convertReqDataIntegrationOptsToAddReqDataOpts(
  integrationOptions: Required<RequestDataIntegrationOptions>,
): AddRequestDataToEventOptions {
  const {
    transactionNamingScheme,
    include: { ip, user, ...requestOptions },
  } = integrationOptions;

  const requestIncludeKeys: string[] = ['method'];
  for (const [key, value] of Object.entries(requestOptions)) {
    if (value) {
      requestIncludeKeys.push(key);
    }
  }

  let addReqDataUserOpt;
  if (user === undefined) {
    addReqDataUserOpt = true;
  } else if (typeof user === 'boolean') {
    addReqDataUserOpt = user;
  } else {
    const userIncludeKeys: string[] = [];
    for (const [key, value] of Object.entries(user)) {
      if (value) {
        userIncludeKeys.push(key);
      }
    }
    addReqDataUserOpt = userIncludeKeys;
  }

  return {
    include: {
      ip,
      user: addReqDataUserOpt,
      request: requestIncludeKeys.length !== 0 ? requestIncludeKeys : undefined,
      transaction: transactionNamingScheme,
    },
  };
}
