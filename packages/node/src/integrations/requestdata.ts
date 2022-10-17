// TODO (v8 or v9): Whenever this becomes a default integration for `@sentry/browser`, move this to `@sentry/core`. For
// now, we leave it in `@sentry/integrations` so that it doesn't contribute bytes to our CDN bundles.

import { EventProcessor, Hub, Integration, Transaction } from '@sentry/types';
import { extractPathForTransaction } from '@sentry/utils';

import { addRequestDataToEvent, AddRequestDataToEventOptions, TransactionNamingScheme } from '../requestdata';

type RequestDataIntegrationOptions = {
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
    user?:
      | boolean
      | {
          id?: boolean;
          username?: boolean;
          email?: boolean;
        };
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
    user: {
      id: true,
      username: true,
      email: true,
    },
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

  private _options: RequestDataIntegrationOptions;

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<RequestDataIntegrationOptions> = {}) {
    this._options = {
      ...DEFAULT_OPTIONS,
      ...options,
      include: {
        // @ts-ignore It's mad because `method` isn't a known `include` key. (It's only here and not set by default in
        // `addRequestDataToEvent` for legacy reasons. TODO (v8): Change that.)
        method: true,
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
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (eventProcessor: EventProcessor) => void, getCurrentHub: () => Hub): void {
    // Note: In the long run, most of the logic here should probably move into the request data utility functions. For
    // the moment it lives here, though, until https://github.com/getsentry/sentry-javascript/issues/5718 is addressed.
    // (TL;DR: Those functions touch many parts of the repo in many different ways, and need to be clened up. Once
    // that's happened, it will be easier to add this logic in without worrying about unexpected side effects.)
    const { include, addRequestData, transactionNamingScheme } = this._options;

    addGlobalEventProcessor(event => {
      const hub = getCurrentHub();
      const self = hub.getIntegration(RequestData);
      const req = event.sdkProcessingMetadata && event.sdkProcessingMetadata.request;

      // If the globally installed instance of this integration isn't associated with the current hub, `self` will be
      // undefined
      if (!self || !req) {
        return event;
      }

      const processedEvent = addRequestData(event, req, { include: formatIncludeOption(include) });

      // Transaction events already have the right `transaction` value
      if (event.type === 'transaction' || transactionNamingScheme === 'handler') {
        return processedEvent;
      }

      // In all other cases, use the request's associated transaction (if any) to overwrite the event's `transaction`
      // value with a high-quality one
      const reqWithTransaction = req as { _sentryTransaction?: Transaction };
      const transaction = reqWithTransaction._sentryTransaction;
      if (transaction) {
        // TODO (v8): Remove the nextjs check and just base it on `transactionNamingScheme` for all SDKs. (We have to
        // keep it the way it is for the moment, because changing the names of transactions in Sentry has the potential
        // to break things like alert rules.)
        const shouldIncludeMethodInTransactionName =
          getSDKName(hub) === 'sentry.javascript.nextjs'
            ? transaction.name.startsWith('/api')
            : transactionNamingScheme !== 'path';

        const [transactionValue] = extractPathForTransaction(req, {
          path: true,
          method: shouldIncludeMethodInTransactionName,
          customRoute: transaction.name,
        });

        processedEvent.transaction = transactionValue;
      }

      return processedEvent;
    });
  }
}

/** Convert `include` option to match what `addRequestDataToEvent` expects */
/** TODO: Can possibly be deleted once https://github.com/getsentry/sentry-javascript/issues/5718 is fixed */
function formatIncludeOption(
  integrationInclude: RequestDataIntegrationOptions['include'] = {},
): AddRequestDataToEventOptions['include'] {
  const { ip, user, ...requestOptions } = integrationInclude;

  const requestIncludeKeys: string[] = [];
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
    ip,
    user: addReqDataUserOpt,
    request: requestIncludeKeys.length !== 0 ? requestIncludeKeys : undefined,
  };
}

function getSDKName(hub: Hub): string | undefined {
  try {
    // For a long chain like this, it's fewer bytes to combine a try-catch with assuming everything is there than to
    // write out a long chain of `a && a.b && a.b.c && ...`
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return hub.getClient()!.getOptions()!._metadata!.sdk!.name;
  } catch (err) {
    // In theory we should never get here
    return undefined;
  }
}
