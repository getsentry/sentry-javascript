import type { ServerRuntimeClient } from '@sentry/core';
import { flush, getCurrentHub } from '@sentry/core';
import type { Event, EventHint, Hub, Integration, Primitive, StackParser } from '@sentry/types';
import { addExceptionMechanism, eventFromUnknownInput, isPrimitive } from '@sentry/utils';

type GlobalHandlersIntegrationsOptionKeys = 'error' | 'unhandledrejection';

/** JSDoc */
type GlobalHandlersIntegrations = Record<GlobalHandlersIntegrationsOptionKeys, boolean>;

let isExiting = false;

/** Global handlers */
export class GlobalHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public static id = 'GlobalHandlers';

  /**
   * @inheritDoc
   */
  public name: string = GlobalHandlers.id;

  /** JSDoc */
  private readonly _options: GlobalHandlersIntegrations;

  /**
   * Stores references functions to installing handlers. Will set to undefined
   * after they have been run so that they are not used twice.
   */
  private _installFunc: Record<GlobalHandlersIntegrationsOptionKeys, (() => void) | undefined> = {
    error: _installGlobalErrorHandler,
    unhandledrejection: _installGlobalUnhandledRejectionHandler,
  };

  /** JSDoc */
  public constructor(options?: GlobalHandlersIntegrations) {
    this._options = {
      error: true,
      unhandledrejection: true,
      ...options,
    };
  }
  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const options = this._options;

    // We can disable guard-for-in as we construct the options object above + do checks against
    // `this._installFunc` for the property.
    // eslint-disable-next-line guard-for-in
    for (const key in options) {
      const installFunc = this._installFunc[key as GlobalHandlersIntegrationsOptionKeys];
      if (installFunc && options[key as GlobalHandlersIntegrationsOptionKeys]) {
        installFunc();
        this._installFunc[key as GlobalHandlersIntegrationsOptionKeys] = undefined;
      }
    }
  }
}

function _installGlobalErrorHandler(): void {
  addEventListener('error', data => {
    if (isExiting) {
      return;
    }

    const [hub, stackParser] = getHubAndOptions();
    const { message, error } = data;

    const event = eventFromUnknownInput(getCurrentHub, stackParser, error || message);

    event.level = 'fatal';

    addMechanismAndCapture(hub, error, event, 'error');

    // Stop the app from exiting for now
    data.preventDefault();
    isExiting = true;

    void flush().then(() => {
      // rethrow to replicate Deno default behavior
      throw error;
    });
  });
}

/** JSDoc */
function _installGlobalUnhandledRejectionHandler(): void {
  addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (isExiting) {
      return;
    }

    const [hub, stackParser] = getHubAndOptions();
    if (!hub.getIntegration(GlobalHandlers)) {
      return;
    }
    let error = e;

    // dig the object of the rejection out of known event types
    try {
      if ('reason' in e) {
        error = e.reason;
      }
    } catch (_oO) {
      // no-empty
    }

    const event = isPrimitive(error)
      ? _eventFromRejectionWithPrimitive(error)
      : eventFromUnknownInput(getCurrentHub, stackParser, error, undefined);

    event.level = 'fatal';

    addMechanismAndCapture(hub, error as unknown as Error, event, 'unhandledrejection');

    // Stop the app from exiting for now
    e.preventDefault();
    isExiting = true;

    void flush().then(() => {
      // rethrow to replicate Deno default behavior
      throw error;
    });
  });
}

/**
 * Create an event from a promise rejection where the `reason` is a primitive.
 *
 * @param reason: The `reason` property of the promise rejection
 * @returns An Event object with an appropriate `exception` value
 */
function _eventFromRejectionWithPrimitive(reason: Primitive): Event {
  return {
    exception: {
      values: [
        {
          type: 'UnhandledRejection',
          // String() is needed because the Primitive type includes symbols (which can't be automatically stringified)
          value: `Non-Error promise rejection captured with value: ${String(reason)}`,
        },
      ],
    },
  };
}

function addMechanismAndCapture(hub: Hub, error: EventHint['originalException'], event: Event, type: string): void {
  addExceptionMechanism(event, {
    handled: false,
    type,
  });
  hub.captureEvent(event, {
    originalException: error,
  });
}

function getHubAndOptions(): [Hub, StackParser] {
  const hub = getCurrentHub();
  const client = hub.getClient<ServerRuntimeClient>();
  const options = (client && client.getOptions()) || {
    stackParser: () => [],
    attachStacktrace: false,
  };
  return [hub, options.stackParser];
}
