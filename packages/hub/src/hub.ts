/* eslint-disable max-lines */
import {
  Breadcrumb,
  BreadcrumbHint,
  Client,
  CustomSamplingContext,
  Event,
  EventHint,
  Extra,
  Extras,
  Hub as HubInterface,
  Integration,
  IntegrationClass,
  Primitive,
  SessionContext,
  SessionStatus,
  Severity,
  Span,
  SpanContext,
  Transaction,
  TransactionContext,
  User,
} from '@sentry/types';
import { consoleSandbox, dateTimestampInSeconds, getGlobalObject, isNodeEnv, logger, uuid4 } from '@sentry/utils';

import { Carrier, DomainAsCarrier, Layer } from './interfaces';
import { Scope } from './scope';
import { Session } from './session';

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be increased when the global interface
 * changes and new methods are introduced.
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
  private readonly _stack: Layer[] = [{}];

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
    this.getStackTop().scope = scope;
    this.bindClient(client);
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
    const scope = Scope.clone(this.getScope());
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
    if (this.getStack().length <= 1) return false;
    return !!this.getStack().pop();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
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
    const { scope, client } = this.getStackTop();

    if (!scope || !client) return;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } =
      (client.getOptions && client.getOptions()) || {};

    if (maxBreadcrumbs <= 0) return;

    const timestamp = dateTimestampInSeconds();
    const mergedBreadcrumb = { timestamp, ...breadcrumb };
    const finalBreadcrumb = beforeBreadcrumb
      ? (consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) as Breadcrumb | null)
      : mergedBreadcrumb;

    if (finalBreadcrumb === null) return;

    scope.addBreadcrumb(finalBreadcrumb, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS));
  }

  /**
   * @inheritDoc
   */
  public setUser(user: User | null): void {
    const scope = this.getScope();
    if (scope) scope.setUser(user);
  }

  /**
   * @inheritDoc
   */
  public setTags(tags: { [key: string]: Primitive }): void {
    const scope = this.getScope();
    if (scope) scope.setTags(tags);
  }

  /**
   * @inheritDoc
   */
  public setExtras(extras: Extras): void {
    const scope = this.getScope();
    if (scope) scope.setExtras(extras);
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: Primitive): void {
    const scope = this.getScope();
    if (scope) scope.setTag(key, value);
  }

  /**
   * @inheritDoc
   */
  public setExtra(key: string, extra: Extra): void {
    const scope = this.getScope();
    if (scope) scope.setExtra(key, extra);
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setContext(name: string, context: { [key: string]: any } | null): void {
    const scope = this.getScope();
    if (scope) scope.setContext(name, context);
  }

  /**
   * @inheritDoc
   */
  public configureScope(callback: (scope: Scope) => void): void {
    const { scope, client } = this.getStackTop();
    if (scope && client) {
      callback(scope);
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
    if (!client) return null;
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
  public startTransaction(context: TransactionContext, customSamplingContext?: CustomSamplingContext): Transaction {
    return this._callExtensionMethod('startTransaction', context, customSamplingContext);
  }

  /**
   * @inheritDoc
   */
  public captureSession(endSession: boolean = false): void {
    // both send the update and pull the session from the scope
    if (endSession) {
      return this.endSession();
    }

    // only send the update
    this._sendSessionUpdate();
  }

  /**
   * @inheritDoc
   */
  public endSession(): void {
    this.getStackTop()
      ?.scope?.getSession()
      ?.close();
    this._sendSessionUpdate();

    // the session is over; take it off of the scope
    this.getStackTop()?.scope?.setSession();
  }

  /**
   * @inheritDoc
   */
  public startSession(context?: SessionContext): Session {
    const { scope, client } = this.getStackTop();
    const { release, environment } = (client && client.getOptions()) || {};
    const session = new Session({
      release,
      environment,
      ...(scope && { user: scope.getUser() }),
      ...context,
    });

    if (scope) {
      // End existing session if there's one
      const currentSession = scope.getSession && scope.getSession();
      if (currentSession && currentSession.status === SessionStatus.Ok) {
        currentSession.update({ status: SessionStatus.Exited });
      }
      this.endSession();

      // Afterwards we set the new session on the scope
      scope.setSession(session);
    }

    return session;
  }

  /**
   * Sends the current Session on the scope
   */
  private _sendSessionUpdate(): void {
    const { scope, client } = this.getStackTop();
    if (!scope) return;

    const session = scope.getSession && scope.getSession();
    if (session) {
      if (client && client.captureSession) {
        client.captureSession(session);
      }
    }
  }

  /**
   * Internal helper function to call a method on the top client if it exists.
   *
   * @param method The method to call on the client.
   * @param args Arguments to pass to the client function.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _invokeClient<M extends keyof Client>(method: M, ...args: any[]): void {
    const { scope, client } = this.getStackTop();
    if (client && client[method]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (client as any)[method](...args, scope);
    }
  }

  /**
   * Calls global extension method and binding current instance to the function call
   */
  // @ts-ignore Function lacks ending return statement and return type does not include 'undefined'. ts(2366)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _callExtensionMethod<T>(method: string, ...args: any[]): T {
    const carrier = getMainCarrier();
    const sentry = carrier.__SENTRY__;
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
 * Returns the active domain, if one exists
 * @deprecated No longer used; remove in v7
 * @returns The domain, or undefined if there is no active domain
 */
// eslint-disable-next-line deprecation/deprecation
export function getActiveDomain(): DomainAsCarrier | undefined {
  logger.warn('Function `getActiveDomain` is deprecated and will be removed in a future version.');

  const sentry = getMainCarrier().__SENTRY__;

  return sentry && sentry.extensions && sentry.extensions.domain && sentry.extensions.domain.active;
}

/**
 * Try to read the hub from an active domain, and fallback to the registry if one doesn't exist
 * @returns discovered hub
 */
function getHubFromActiveDomain(registry: Carrier): Hub {
  try {
    const activeDomain = getMainCarrier().__SENTRY__?.extensions?.domain?.active;

    // If there's no active domain, just return global hub
    if (!activeDomain) {
      return getHubFromCarrier(registry);
    }

    // If there's no hub on current domain, or it's an old API, assign a new one
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
  return !!(carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub);
}

/**
 * This will create a new {@link Hub} and add to the passed object on
 * __SENTRY__.hub.
 * @param carrier object
 * @hidden
 */
export function getHubFromCarrier(carrier: Carrier): Hub {
  if (carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub) return carrier.__SENTRY__.hub;
  carrier.__SENTRY__ = carrier.__SENTRY__ || {};
  carrier.__SENTRY__.hub = new Hub();
  return carrier.__SENTRY__.hub;
}

/**
 * This will set passed {@link Hub} on the passed object's __SENTRY__.hub attribute
 * @param carrier object
 * @param hub Hub
 * @returns A boolean indicating success or failure
 */
export function setHubOnCarrier(carrier: Carrier, hub: Hub): boolean {
  if (!carrier) return false;
  carrier.__SENTRY__ = carrier.__SENTRY__ || {};
  carrier.__SENTRY__.hub = hub;
  return true;
}
