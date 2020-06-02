import {
  Breadcrumb,
  BreadcrumbHint,
  Client,
  Event,
  EventHint,
  Hub as HubInterface,
  Integration,
  IntegrationClass,
  Severity,
  Span,
  SpanContext,
  Transaction,
  TransactionContext,
  User,
} from '@sentry/types';
import { consoleSandbox, getGlobalObject, isNodeEnv, logger, timestampWithMs, uuid4 } from '@sentry/utils';

import { Carrier, Layer } from './interfaces';
import { Scope } from './scope';

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be incresed when the global interface
 * changes a and new methods are introduced.
 *
 * @hidden
 */
export const API_VERSION = 3;

/**
 * Default maximum number of breadcrumbs added to an event. Can be overwritten
 * with {@link Options.maxBreadcrumbs}.
 */
const DEFAULT_BREADCRUMBS = 100;

/**
 * Absolute maximum number of breadcrumbs added to an event. The
 * `maxBreadcrumbs` option cannot be higher than this value.
 */
const MAX_BREADCRUMBS = 100;

/**
 * @inheritDoc
 */
export class Hub implements HubInterface {
  /** Is a {@link Layer}[] containing the client and scope */
  private readonly _stack: Layer[] = [];

  /** Contains the last event id of a captured event.  */
  private _lastEventId?: string;

  /**
   * Creates a new instance of the hub, will push one {@link Layer} into the
   * internal stack on creation.
   *
   * @param client bound to the hub.
   * @param scope bound to the hub.
   * @param version number, higher number means higher priority.
   */
  public constructor(client?: Client, scope: Scope = new Scope(), private readonly _version: number = API_VERSION) {
    this._stack.push({ client, scope });
  }

  /**
   * Internal helper function to call a method on the top client if it exists.
   *
   * @param method The method to call on the client.
   * @param args Arguments to pass to the client function.
   */
  private _invokeClient<M extends keyof Client>(method: M, ...args: any[]): void {
    const top = this.getStackTop();
    if (top && top.client && top.client[method]) {
      (top.client as any)[method](...args, top.scope);
    }
  }

  /**
   * @inheritDoc
   */
  public isOlderThan(version: number): boolean {
    return this._version < version;
  }

  /**
   * @inheritDoc
   */
  public bindClient(client?: Client): void {
    const top = this.getStackTop();
    top.client = client;
    if (client && client.setupIntegrations) {
      client.setupIntegrations();
    }
  }

  /**
   * @inheritDoc
   */
  public pushScope(): Scope {
    // We want to clone the content of prev scope
    const stack = this.getStack();
    const parentScope = stack.length > 0 ? stack[stack.length - 1].scope : undefined;
    const scope = Scope.clone(parentScope);
    this.getStack().push({
      client: this.getClient(),
      scope,
    });
    return scope;
  }

  /**
   * @inheritDoc
   */
  public popScope(): boolean {
    return this.getStack().pop() !== undefined;
  }

  /**
   * @inheritDoc
   */
  public withScope(callback: (scope: Scope) => void): void {
    const scope = this.pushScope();
    try {
      callback(scope);
    } finally {
      this.popScope();
    }
  }

  /**
   * @inheritDoc
   */
  public getClient<C extends Client>(): C | undefined {
    return this.getStackTop().client as C;
  }

  /** Returns the scope of the top stack. */
  public getScope(): Scope | undefined {
    return this.getStackTop().scope;
  }

  /** Returns the scope stack for domains or the process. */
  public getStack(): Layer[] {
    return this._stack;
  }

  /** Returns the topmost scope layer in the order domain > local > process. */
  public getStackTop(): Layer {
    return this._stack[this._stack.length - 1];
  }

  /**
   * @inheritDoc
   */
  public captureException(exception: any, hint?: EventHint): string {
    const eventId = (this._lastEventId = uuid4());
    let finalHint = hint;

    // If there's no explicit hint provided, mimick the same thing that would happen
    // in the minimal itself to create a consistent behavior.
    // We don't do this in the client, as it's the lowest level API, and doing this,
    // would prevent user from having full control over direct calls.
    if (!hint) {
      let syntheticException: Error;
      try {
        throw new Error('Sentry syntheticException');
      } catch (exception) {
        syntheticException = exception as Error;
      }
      finalHint = {
        originalException: exception,
        syntheticException,
      };
    }

    this._invokeClient('captureException', exception, {
      ...finalHint,
      event_id: eventId,
    });
    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureMessage(message: string, level?: Severity, hint?: EventHint): string {
    const eventId = (this._lastEventId = uuid4());
    let finalHint = hint;

    // If there's no explicit hint provided, mimick the same thing that would happen
    // in the minimal itself to create a consistent behavior.
    // We don't do this in the client, as it's the lowest level API, and doing this,
    // would prevent user from having full control over direct calls.
    if (!hint) {
      let syntheticException: Error;
      try {
        throw new Error(message);
      } catch (exception) {
        syntheticException = exception as Error;
      }
      finalHint = {
        originalException: message,
        syntheticException,
      };
    }

    this._invokeClient('captureMessage', message, level, {
      ...finalHint,
      event_id: eventId,
    });
    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint): string {
    const eventId = (this._lastEventId = uuid4());
    this._invokeClient('captureEvent', event, {
      ...hint,
      event_id: eventId,
    });
    return eventId;
  }

  /**
   * @inheritDoc
   */
  public lastEventId(): string | undefined {
    return this._lastEventId;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
    const top = this.getStackTop();

    if (!top.scope || !top.client) {
      return;
    }

    const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } =
      (top.client.getOptions && top.client.getOptions()) || {};

    if (maxBreadcrumbs <= 0) {
      return;
    }

    const timestamp = timestampWithMs();
    const mergedBreadcrumb = { timestamp, ...breadcrumb };
    const finalBreadcrumb = beforeBreadcrumb
      ? (consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) as Breadcrumb | null)
      : mergedBreadcrumb;

    if (finalBreadcrumb === null) {
      return;
    }

    top.scope.addBreadcrumb(finalBreadcrumb, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS));
  }

  /**
   * @inheritDoc
   */
  public setUser(user: User | null): void {
    const top = this.getStackTop();
    if (!top.scope) {
      return;
    }
    top.scope.setUser(user);
  }

  /**
   * @inheritDoc
   */
  public setTags(tags: { [key: string]: string }): void {
    const top = this.getStackTop();
    if (!top.scope) {
      return;
    }
    top.scope.setTags(tags);
  }

  /**
   * @inheritDoc
   */
  public setExtras(extras: { [key: string]: any }): void {
    const top = this.getStackTop();
    if (!top.scope) {
      return;
    }
    top.scope.setExtras(extras);
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: string): void {
    const top = this.getStackTop();
    if (!top.scope) {
      return;
    }
    top.scope.setTag(key, value);
  }

  /**
   * @inheritDoc
   */
  public setExtra(key: string, extra: any): void {
    const top = this.getStackTop();
    if (!top.scope) {
      return;
    }
    top.scope.setExtra(key, extra);
  }

  /**
   * @inheritDoc
   */
  public setContext(name: string, context: { [key: string]: any } | null): void {
    const top = this.getStackTop();
    if (!top.scope) {
      return;
    }
    top.scope.setContext(name, context);
  }

  /**
   * @inheritDoc
   */
  public configureScope(callback: (scope: Scope) => void): void {
    const top = this.getStackTop();
    if (top.scope && top.client) {
      callback(top.scope);
    }
  }

  /**
   * @inheritDoc
   */
  public run(callback: (hub: Hub) => void): void {
    const oldHub = makeMain(this);
    try {
      callback(this);
    } finally {
      makeMain(oldHub);
    }
  }

  /**
   * @inheritDoc
   */
  public getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
    const client = this.getClient();
    if (!client) {
      return null;
    }
    try {
      return client.getIntegration(integration);
    } catch (_oO) {
      logger.warn(`Cannot retrieve integration ${integration.id} from the current Hub`);
      return null;
    }
  }

  /**
   * @inheritDoc
   */
  public startSpan(context: SpanContext): Span {
    return this._callExtensionMethod('startSpan', context);
  }

  /**
   * @inheritDoc
   */
  public startTransaction(context: TransactionContext): Transaction {
    return this._callExtensionMethod('startTransaction', context);
  }

  /**
   * @inheritDoc
   */
  public traceHeaders(): { [key: string]: string } {
    return this._callExtensionMethod<{ [key: string]: string }>('traceHeaders');
  }

  /**
   * Calls global extension method and binding current instance to the function call
   */
  // @ts-ignore
  private _callExtensionMethod<T>(method: string, ...args: any[]): T {
    const carrier = getMainCarrier();
    const sentry = carrier.__SENTRY__;
    // tslint:disable-next-line: strict-type-predicates
    if (sentry && sentry.extensions && typeof sentry.extensions[method] === 'function') {
      return sentry.extensions[method].apply(this, args);
    }
    logger.warn(`Extension method ${method} couldn't be found, doing nothing.`);
  }
}

/** Returns the global shim registry. */
export function getMainCarrier(): Carrier {
  const carrier = getGlobalObject();
  carrier.__SENTRY__ = carrier.__SENTRY__ || {
    extensions: {},
    hub: undefined,
  };
  return carrier;
}

/**
 * Replaces the current main hub with the passed one on the global object
 *
 * @returns The old replaced hub
 */
export function makeMain(hub: Hub): Hub {
  const registry = getMainCarrier();
  const oldHub = getHubFromCarrier(registry);
  setHubOnCarrier(registry, hub);
  return oldHub;
}

/**
 * Returns the default hub instance.
 *
 * If a hub is already registered in the global carrier but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered hub will be returned.
 */
export function getCurrentHub(): Hub {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();

  // If there's no hub, or its an old API, assign a new one
  if (!hasHubOnCarrier(registry) || getHubFromCarrier(registry).isOlderThan(API_VERSION)) {
    setHubOnCarrier(registry, new Hub());
  }

  // Prefer domains over global if they are there (applicable only to Node environment)
  if (isNodeEnv()) {
    return getHubFromActiveDomain(registry);
  }
  // Return hub that lives on a global object
  return getHubFromCarrier(registry);
}

/**
 * Try to read the hub from an active domain, fallback to the registry if one doesnt exist
 * @returns discovered hub
 */
function getHubFromActiveDomain(registry: Carrier): Hub {
  try {
    const property = 'domain';
    const carrier = getMainCarrier();
    const sentry = carrier.__SENTRY__;
    // tslint:disable-next-line: strict-type-predicates
    if (!sentry || !sentry.extensions || !sentry.extensions[property]) {
      return getHubFromCarrier(registry);
    }
    const domain = sentry.extensions[property] as any;
    const activeDomain = domain.active;

    // If there no active domain, just return global hub
    if (!activeDomain) {
      return getHubFromCarrier(registry);
    }

    // If there's no hub on current domain, or its an old API, assign a new one
    if (!hasHubOnCarrier(activeDomain) || getHubFromCarrier(activeDomain).isOlderThan(API_VERSION)) {
      const registryHubTopStack = getHubFromCarrier(registry).getStackTop();
      setHubOnCarrier(activeDomain, new Hub(registryHubTopStack.client, Scope.clone(registryHubTopStack.scope)));
    }

    // Return hub that lives on a domain
    return getHubFromCarrier(activeDomain);
  } catch (_Oo) {
    // Return hub that lives on a global object
    return getHubFromCarrier(registry);
  }
}

/**
 * This will tell whether a carrier has a hub on it or not
 * @param carrier object
 */
function hasHubOnCarrier(carrier: Carrier): boolean {
  if (carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub) {
    return true;
  }
  return false;
}

/**
 * This will create a new {@link Hub} and add to the passed object on
 * __SENTRY__.hub.
 * @param carrier object
 * @hidden
 */
export function getHubFromCarrier(carrier: Carrier): Hub {
  if (carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub) {
    return carrier.__SENTRY__.hub;
  }
  carrier.__SENTRY__ = carrier.__SENTRY__ || {};
  carrier.__SENTRY__.hub = new Hub();
  return carrier.__SENTRY__.hub;
}

/**
 * This will set passed {@link Hub} on the passed object's __SENTRY__.hub attribute
 * @param carrier object
 * @param hub Hub
 */
export function setHubOnCarrier(carrier: Carrier, hub: Hub): boolean {
  if (!carrier) {
    return false;
  }
  carrier.__SENTRY__ = carrier.__SENTRY__ || {};
  carrier.__SENTRY__.hub = hub;
  return true;
}
