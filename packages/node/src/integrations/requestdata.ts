// TODO (v8 or v9): Whenever this becomes a default integration for `@sentry/browser`, move this to `@sentry/core`. For
// now, we leave it in `@sentry/integrations` so that it doesn't contribute bytes to our CDN bundles.

import { EventProcessor, Hub, Integration } from '@sentry/types';

import {
  addRequestDataToEvent,
  AddRequestDataToEventOptions,
  DEFAULT_USER_INCLUDES,
  TransactionNamingScheme,
} from '../requestdata';

type RequestDataOptions = {
  /**
   * Controls what data is pulled from the request and added to the event
   */
  include: {
    cookies?: boolean;
    data?: boolean;
    headers?: boolean;
    ip?: boolean;
    query_string?: boolean;
    url?: boolean;
    user?: boolean | Array<typeof DEFAULT_USER_INCLUDES[number]>;
  };

  /** Whether to identify transactions by parameterized path, parameterized path with method, or handler name */
  transactionNamingScheme: TransactionNamingScheme;

  /**
   * Function for adding request data to event. Defaults to `addRequestDataToEvent` from `@sentry/node` for now, but
   * left injectable so this integration can be moved to `@sentry/core` and used in browser-based SDKs in the future.
   *
   * @hidden
   */
  addRequestData: typeof addRequestDataToEvent;
};

const DEFAULT_OPTIONS = {
  addRequestData: addRequestDataToEvent,
  include: {
    cookies: true,
    data: true,
    headers: true,
    ip: false,
    query_string: true,
    url: true,
    user: DEFAULT_USER_INCLUDES,
  },
  transactionNamingScheme: 'methodpath',
};

/** Add data about a request to an event. Primarily for use in Node-based SDKs, but included in `@sentry/integrations`
 * so it can be used in cross-platform SDKs like `@sentry/nextjs`. */
export class RequestData implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'RequestData';

  /**
   * @inheritDoc
   */
  public name: string = RequestData.id;

  private _options: RequestDataOptions;

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<RequestDataOptions> = {}) {
    this._options = {
      ...DEFAULT_OPTIONS,
      ...options,
      include: {
        // @ts-ignore It's mad because `method` isn't a known `include` key. (It's only here and not set by default in
        // `addRequestDataToEvent` for legacy reasons. TODO (v8): Change that.)
        method: true,
        ...DEFAULT_OPTIONS.include,
        ...options.include,
      },
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (eventProcessor: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const { include, addRequestData } = this._options;

    addGlobalEventProcessor(event => {
      const self = getCurrentHub().getIntegration(RequestData);
      const req = event.sdkProcessingMetadata && event.sdkProcessingMetadata.request;

      // If the globally installed instance of this integration isn't associated with the current hub, `self` will be
      // undefined
      if (!self || !req) {
        return event;
      }

      return addRequestData(event, req, { include: formatIncludeOption(include) });
    });
  }
}

/** Convert `include` option to match what `addRequestDataToEvent` expects */
/** TODO: Can possibly be deleted once https://github.com/getsentry/sentry-javascript/issues/5718 is fixed */
function formatIncludeOption(
  integrationInclude: RequestDataOptions['include'] = {},
): AddRequestDataToEventOptions['include'] {
  const { ip, user, ...requestOptions } = integrationInclude;

  const requestIncludeKeys: string[] = [];
  for (const [key, value] of Object.entries(requestOptions)) {
    if (value) {
      requestIncludeKeys.push(key);
    }
  }

  return {
    ip,
    user,
    request: requestIncludeKeys.length !== 0 ? requestIncludeKeys : undefined,
  };
}
