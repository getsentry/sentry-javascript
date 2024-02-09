/* eslint-disable max-lines */
import type {
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
  Session,
  SessionContext,
  Severity,
  SeverityLevel,
  Transaction,
  TransactionContext,
  User,
} from '@sentry/types';
import {
  GLOBAL_OBJ,
  consoleSandbox,
  dateTimestampInSeconds,
  getGlobalSingleton,
  isThenable,
  logger,
  uuid4,
} from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from './constants';
import { DEBUG_BUILD } from './debug-build';
import { Scope } from './scope';
import { closeSession, makeSession, updateSession } from './session';
import { SDK_VERSION } from './version';

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be increased when the global interface
 * changes and new methods are introduced.
 *
 * @hidden
 */
export const API_VERSION = parseFloat(SDK_VERSION);

/**
 * Default maximum number of breadcrumbs added to an event. Can be overwritten
 * with {@link Options.maxBreadcrumbs}.
 */
const DEFAULT_BREADCRUMBS = 100;

export interface RunWithAsyncContextOptions {
  /** Whether to reuse an existing async context if one exists. Defaults to false. */
  reuseExisting?: boolean;
}

/**
 * @private Private API with no semver guarantees!
 *
 * Strategy used to track async context.
 */
export interface AsyncContextStrategy {
  /**
   * Gets the current async context. Returns undefined if there is no current async context.
   */
  getCurrentHub: () => Hub | undefined;
  /**
   * Runs the supplied callback in its own async context.
   */
  runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions): T;
}

/**
 * A layer in the process stack.
 * @hidden
 */
export interface Layer {
  client?: Client;
  scope: Scope;
}

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: {
    hub?: Hub;
    acs?: AsyncContextStrategy;
    /**
     * Extra Hub properties injected by various SDKs
     */
    integrations?: Integration[];
    extensions?: {
      /** Extension methods for the hub, which are bound to the current Hub instance */
      // eslint-disable-next-line @typescript-eslint/ban-types
      [key: string]: Function;
    };
  };
}

/**
 * @inheritDoc
 */
export class Hub implements HubInterface {
  /** Is a {@link Layer}[] containing the client and scope */
  private readonly _stack: Layer[];

  /** Contains the last event id of a captured event.  */
  private _lastEventId?: string;

  private _isolationScope: Scope;

  /**
   * Creates a new instance of the hub, will push one {@link Layer} into the
   * internal stack on creation.
   *
   * @param client bound to the hub.
   * @param scope bound to the hub.
   * @param version number, higher number means higher priority.
   *
   * @deprecated Instantiation of Hub objects is deprecated and the constructor will be removed in version 8 of the SDK.
   *
   * If you are currently using the Hub for multi-client use like so:
   *
   * ```
   * // OLD
   * const hub = new Hub();
   * hub.bindClient(client);
   * makeMain(hub)
   * ```
   *
   * instead initialize the client as follows:
   *
   * ```
   * // NEW
   * Sentry.withIsolationScope(() => {
   *    Sentry.setCurrentClient(client);
   *    client.init();
   * });
   * ```
   *
   * If you are using the Hub to capture events like so:
   *
   * ```
   * // OLD
   * const client = new Client();
   * const hub = new Hub(client);
   * hub.captureException()
   * ```
   *
   * instead capture isolated events as follows:
   *
   * ```
   * // NEW
   * const client = new Client();
   * const scope = new Scope();
   * scope.setClient(client);
   * scope.captureException();
   * ```
   */
  public constructor(
    client?: Client,
    scope?: Scope,
    isolationScope?: Scope,
    private readonly _version: number = API_VERSION,
  ) {
    let assignedScope;
    if (!scope) {
      assignedScope = new Scope();
      assignedScope.setClient(client);
    } else {
      assignedScope = scope;
    }

    let assignedIsolationScope;
    if (!isolationScope) {
      assignedIsolationScope = new Scope();
      assignedIsolationScope.setClient(client);
    } else {
      assignedIsolationScope = isolationScope;
    }

    this._stack = [{ scope: assignedScope }];

    if (client) {
      // eslint-disable-next-line deprecation/deprecation
      this.bindClient(client);
    }

    this._isolationScope = assignedIsolationScope;
  }

  /**
   * Checks if this hub's version is older than the given version.
   *
   * @param version A version number to compare to.
   * @return True if the given version is newer; otherwise false.
   *
   * @deprecated This will be removed in v8.
   */
  public isOlderThan(version: number): boolean {
    return this._version < version;
  }

  /**
   * This binds the given client to the current scope.
   * @param client An SDK client (client) instance.
   *
   * @deprecated Use `initAndBind()` directly, or `setCurrentClient()` and/or `client.init()` instead.
   */
  public bindClient(client?: Client): void {
    // eslint-disable-next-line deprecation/deprecation
    const top = this.getStackTop();
    top.client = client;
    top.scope.setClient(client);
    // eslint-disable-next-line deprecation/deprecation
    if (client && client.setupIntegrations) {
      // eslint-disable-next-line deprecation/deprecation
      client.setupIntegrations();
    }
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `withScope` instead.
   */
  public pushScope(): Scope {
    // We want to clone the content of prev scope
    // eslint-disable-next-line deprecation/deprecation
    const scope = this.getScope().clone();
    // eslint-disable-next-line deprecation/deprecation
    this.getStack().push({
      // eslint-disable-next-line deprecation/deprecation
      client: this.getClient(),
      scope,
    });
    return scope;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `withScope` instead.
   */
  public popScope(): boolean {
    // eslint-disable-next-line deprecation/deprecation
    if (this.getStack().length <= 1) return false;
    // eslint-disable-next-line deprecation/deprecation
    return !!this.getStack().pop();
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.withScope()` instead.
   */
  public withScope<T>(callback: (scope: Scope) => T): T {
    // eslint-disable-next-line deprecation/deprecation
    const scope = this.pushScope();

    let maybePromiseResult: T;
    try {
      maybePromiseResult = callback(scope);
    } catch (e) {
      // eslint-disable-next-line deprecation/deprecation
      this.popScope();
      throw e;
    }

    if (isThenable(maybePromiseResult)) {
      // @ts-expect-error - isThenable returns the wrong type
      return maybePromiseResult.then(
        res => {
          // eslint-disable-next-line deprecation/deprecation
          this.popScope();
          return res;
        },
        e => {
          // eslint-disable-next-line deprecation/deprecation
          this.popScope();
          throw e;
        },
      );
    }

    // eslint-disable-next-line deprecation/deprecation
    this.popScope();
    return maybePromiseResult;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.getClient()` instead.
   */
  public getClient<C extends Client>(): C | undefined {
    // eslint-disable-next-line deprecation/deprecation
    return this.getStackTop().client as C;
  }

  /**
   * Returns the scope of the top stack.
   *
   * @deprecated Use `Sentry.getCurrentScope()` instead.
   */
  public getScope(): Scope {
    // eslint-disable-next-line deprecation/deprecation
    return this.getStackTop().scope;
  }

  /**
   * @deprecated Use `Sentry.getIsolationScope()` instead.
   */
  public getIsolationScope(): Scope {
    return this._isolationScope;
  }

  /**
   * Returns the scope stack for domains or the process.
   * @deprecated This will be removed in v8.
   */
  public getStack(): Layer[] {
    return this._stack;
  }

  /**
   * Returns the topmost scope layer in the order domain > local > process.
   * @deprecated This will be removed in v8.
   */
  public getStackTop(): Layer {
    return this._stack[this._stack.length - 1];
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.captureException()` instead.
   */
  public captureException(exception: unknown, hint?: EventHint): string {
    const eventId = (this._lastEventId = hint && hint.event_id ? hint.event_id : uuid4());
    const syntheticException = new Error('Sentry syntheticException');
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().captureException(exception, {
      originalException: exception,
      syntheticException,
      ...hint,
      event_id: eventId,
    });

    return eventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use  `Sentry.captureMessage()` instead.
   */
  public captureMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level?: Severity | SeverityLevel,
    hint?: EventHint,
  ): string {
    const eventId = (this._lastEventId = hint && hint.event_id ? hint.event_id : uuid4());
    const syntheticException = new Error(message);
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().captureMessage(message, level, {
      originalException: message,
      syntheticException,
      ...hint,
      event_id: eventId,
    });

    return eventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.captureEvent()` instead.
   */
  public captureEvent(event: Event, hint?: EventHint): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    if (!event.type) {
      this._lastEventId = eventId;
    }
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().captureEvent(event, { ...hint, event_id: eventId });
    return eventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated This will be removed in v8.
   */
  public lastEventId(): string | undefined {
    return this._lastEventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.addBreadcrumb()` instead.
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
    // eslint-disable-next-line deprecation/deprecation
    const { scope, client } = this.getStackTop();

    if (!client) return;

    const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } =
      (client.getOptions && client.getOptions()) || {};

    if (maxBreadcrumbs <= 0) return;

    const timestamp = dateTimestampInSeconds();
    const mergedBreadcrumb = { timestamp, ...breadcrumb };
    const finalBreadcrumb = beforeBreadcrumb
      ? (consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) as Breadcrumb | null)
      : mergedBreadcrumb;

    if (finalBreadcrumb === null) return;

    if (client.emit) {
      client.emit('beforeAddBreadcrumb', finalBreadcrumb, hint);
    }

    // TODO(v8): I know this comment doesn't make much sense because the hub will be deprecated but I still wanted to
    // write it down. In theory, we would have to add the breadcrumbs to the isolation scope here, however, that would
    // duplicate all of the breadcrumbs. There was the possibility of adding breadcrumbs to both, the isolation scope
    // and the normal scope, and deduplicating it down the line in the event processing pipeline. However, that would
    // have been very fragile, because the breadcrumb objects would have needed to keep their identity all throughout
    // the event processing pipeline.
    // In the new implementation, the top level `Sentry.addBreadcrumb()` should ONLY write to the isolation scope.

    scope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setUser()` instead.
   */
  public setUser(user: User | null): void {
    // TODO(v8): The top level `Sentry.setUser()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setUser(user);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setUser(user);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setTags()` instead.
   */
  public setTags(tags: { [key: string]: Primitive }): void {
    // TODO(v8): The top level `Sentry.setTags()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setTags(tags);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setTags(tags);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setExtras()` instead.
   */
  public setExtras(extras: Extras): void {
    // TODO(v8): The top level `Sentry.setExtras()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setExtras(extras);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setExtras(extras);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setTag()` instead.
   */
  public setTag(key: string, value: Primitive): void {
    // TODO(v8): The top level `Sentry.setTag()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setTag(key, value);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setTag(key, value);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setExtra()` instead.
   */
  public setExtra(key: string, extra: Extra): void {
    // TODO(v8): The top level `Sentry.setExtra()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setExtra(key, extra);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setExtra(key, extra);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setContext()` instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setContext(name: string, context: { [key: string]: any } | null): void {
    // TODO(v8): The top level `Sentry.setContext()` function should write ONLY to the isolation scope.
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().setContext(name, context);
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setContext(name, context);
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `getScope()` directly.
   */
  public configureScope(callback: (scope: Scope) => void): void {
    // eslint-disable-next-line deprecation/deprecation
    const { scope, client } = this.getStackTop();
    if (client) {
      callback(scope);
    }
  }

  /**
   * @inheritDoc
   */
  public run(callback: (hub: Hub) => void): void {
    // eslint-disable-next-line deprecation/deprecation
    const oldHub = makeMain(this);
    try {
      callback(this);
    } finally {
      // eslint-disable-next-line deprecation/deprecation
      makeMain(oldHub);
    }
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.getClient().getIntegrationByName()` instead.
   */
  public getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
    // eslint-disable-next-line deprecation/deprecation
    const client = this.getClient();
    if (!client) return null;
    try {
      // eslint-disable-next-line deprecation/deprecation
      return client.getIntegration(integration);
    } catch (_oO) {
      DEBUG_BUILD && logger.warn(`Cannot retrieve integration ${integration.id} from the current Hub`);
      return null;
    }
  }

  /**
   * Starts a new `Transaction` and returns it. This is the entry point to manual tracing instrumentation.
   *
   * A tree structure can be built by adding child spans to the transaction, and child spans to other spans. To start a
   * new child span within the transaction or any span, call the respective `.startChild()` method.
   *
   * Every child span must be finished before the transaction is finished, otherwise the unfinished spans are discarded.
   *
   * The transaction must be finished with a call to its `.end()` method, at which point the transaction with all its
   * finished child spans will be sent to Sentry.
   *
   * @param context Properties of the new `Transaction`.
   * @param customSamplingContext Information given to the transaction sampling function (along with context-dependent
   * default values). See {@link Options.tracesSampler}.
   *
   * @returns The transaction which was just started
   *
   * @deprecated Use `startSpan()`, `startSpanManual()` or `startInactiveSpan()` instead.
   */
  public startTransaction(context: TransactionContext, customSamplingContext?: CustomSamplingContext): Transaction {
    const result = this._callExtensionMethod<Transaction>('startTransaction', context, customSamplingContext);

    if (DEBUG_BUILD && !result) {
      // eslint-disable-next-line deprecation/deprecation
      const client = this.getClient();
      if (!client) {
        logger.warn(
          "Tracing extension 'startTransaction' is missing. You should 'init' the SDK before calling 'startTransaction'",
        );
      } else {
        logger.warn(`Tracing extension 'startTransaction' has not been added. Call 'addTracingExtensions' before calling 'init':
Sentry.addTracingExtensions();
Sentry.init({...});
`);
      }
    }

    return result;
  }

  /**
   * @inheritDoc
   * @deprecated Use `spanToTraceHeader()` instead.
   */
  public traceHeaders(): { [key: string]: string } {
    return this._callExtensionMethod<{ [key: string]: string }>('traceHeaders');
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use top level `captureSession` instead.
   */
  public captureSession(endSession: boolean = false): void {
    // both send the update and pull the session from the scope
    if (endSession) {
      // eslint-disable-next-line deprecation/deprecation
      return this.endSession();
    }

    // only send the update
    this._sendSessionUpdate();
  }

  /**
   * @inheritDoc
   * @deprecated Use top level `endSession` instead.
   */
  public endSession(): void {
    // eslint-disable-next-line deprecation/deprecation
    const layer = this.getStackTop();
    const scope = layer.scope;
    const session = scope.getSession();
    if (session) {
      closeSession(session);
    }
    this._sendSessionUpdate();

    // the session is over; take it off of the scope
    scope.setSession();
  }

  /**
   * @inheritDoc
   * @deprecated Use top level `startSession` instead.
   */
  public startSession(context?: SessionContext): Session {
    // eslint-disable-next-line deprecation/deprecation
    const { scope, client } = this.getStackTop();
    const { release, environment = DEFAULT_ENVIRONMENT } = (client && client.getOptions()) || {};

    // Will fetch userAgent if called from browser sdk
    const { userAgent } = GLOBAL_OBJ.navigator || {};

    const session = makeSession({
      release,
      environment,
      user: scope.getUser(),
      ...(userAgent && { userAgent }),
      ...context,
    });

    // End existing session if there's one
    const currentSession = scope.getSession && scope.getSession();
    if (currentSession && currentSession.status === 'ok') {
      updateSession(currentSession, { status: 'exited' });
    }
    // eslint-disable-next-line deprecation/deprecation
    this.endSession();

    // Afterwards we set the new session on the scope
    scope.setSession(session);

    return session;
  }

  /**
   * Returns if default PII should be sent to Sentry and propagated in ourgoing requests
   * when Tracing is used.
   *
   * @deprecated Use top-level `getClient().getOptions().sendDefaultPii` instead. This function
   * only unnecessarily increased API surface but only wrapped accessing the option.
   */
  public shouldSendDefaultPii(): boolean {
    // eslint-disable-next-line deprecation/deprecation
    const client = this.getClient();
    const options = client && client.getOptions();
    return Boolean(options && options.sendDefaultPii);
  }

  /**
   * Sends the current Session on the scope
   */
  private _sendSessionUpdate(): void {
    // eslint-disable-next-line deprecation/deprecation
    const { scope, client } = this.getStackTop();

    const session = scope.getSession();
    if (session && client && client.captureSession) {
      client.captureSession(session);
    }
  }

  /**
   * Calls global extension method and binding current instance to the function call
   */
  // @ts-expect-error Function lacks ending return statement and return type does not include 'undefined'. ts(2366)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _callExtensionMethod<T>(method: string, ...args: any[]): T {
    const carrier = getMainCarrier();
    const sentry = carrier.__SENTRY__;
    if (sentry && sentry.extensions && typeof sentry.extensions[method] === 'function') {
      return sentry.extensions[method].apply(this, args);
    }
    DEBUG_BUILD && logger.warn(`Extension method ${method} couldn't be found, doing nothing.`);
  }
}

/**
 * Returns the global shim registry.
 *
 * FIXME: This function is problematic, because despite always returning a valid Carrier,
 * it has an optional `__SENTRY__` property, which then in turn requires us to always perform an unnecessary check
 * at the call-site. We always access the carrier through this function, so we can guarantee that `__SENTRY__` is there.
 **/
export function getMainCarrier(): Carrier {
  GLOBAL_OBJ.__SENTRY__ = GLOBAL_OBJ.__SENTRY__ || {
    extensions: {},
    hub: undefined,
  };
  return GLOBAL_OBJ;
}

/**
 * Replaces the current main hub with the passed one on the global object
 *
 * @returns The old replaced hub
 *
 * @deprecated Use `setCurrentClient()` instead.
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
 *
 * @deprecated Use the respective replacement method directly instead.
 */
export function getCurrentHub(): Hub {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();

  if (registry.__SENTRY__ && registry.__SENTRY__.acs) {
    const hub = registry.__SENTRY__.acs.getCurrentHub();

    if (hub) {
      return hub;
    }
  }

  // Return hub that lives on a global object
  return getGlobalHub(registry);
}

/**
 * Get the currently active isolation scope.
 * The isolation scope is active for the current exection context,
 * meaning that it will remain stable for the same Hub.
 */
export function getIsolationScope(): Scope {
  // eslint-disable-next-line deprecation/deprecation
  return getCurrentHub().getIsolationScope();
}

function getGlobalHub(registry: Carrier = getMainCarrier()): Hub {
  // If there's no hub, or its an old API, assign a new one

  if (
    !hasHubOnCarrier(registry) ||
    // eslint-disable-next-line deprecation/deprecation
    getHubFromCarrier(registry).isOlderThan(API_VERSION)
  ) {
    // eslint-disable-next-line deprecation/deprecation
    setHubOnCarrier(registry, new Hub());
  }

  // Return hub that lives on a global object
  return getHubFromCarrier(registry);
}

/**
 * @private Private API with no semver guarantees!
 *
 * If the carrier does not contain a hub, a new hub is created with the global hub client and scope.
 */
export function ensureHubOnCarrier(carrier: Carrier, parent: Hub = getGlobalHub()): void {
  // If there's no hub on current domain, or it's an old API, assign a new one
  if (
    !hasHubOnCarrier(carrier) ||
    // eslint-disable-next-line deprecation/deprecation
    getHubFromCarrier(carrier).isOlderThan(API_VERSION)
  ) {
    // eslint-disable-next-line deprecation/deprecation
    const client = parent.getClient();
    // eslint-disable-next-line deprecation/deprecation
    const scope = parent.getScope();
    // eslint-disable-next-line deprecation/deprecation
    const isolationScope = parent.getIsolationScope();
    // eslint-disable-next-line deprecation/deprecation
    setHubOnCarrier(carrier, new Hub(client, scope.clone(), isolationScope.clone()));
  }
}

/**
 * @private Private API with no semver guarantees!
 *
 * Sets the global async context strategy
 */
export function setAsyncContextStrategy(strategy: AsyncContextStrategy | undefined): void {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();
  registry.__SENTRY__ = registry.__SENTRY__ || {};
  registry.__SENTRY__.acs = strategy;
}

/**
 * Runs the supplied callback in its own async context. Async Context strategies are defined per SDK.
 *
 * @param callback The callback to run in its own async context
 * @param options Options to pass to the async context strategy
 * @returns The result of the callback
 */
export function runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions = {}): T {
  const registry = getMainCarrier();

  if (registry.__SENTRY__ && registry.__SENTRY__.acs) {
    return registry.__SENTRY__.acs.runWithAsyncContext(callback, options);
  }

  // if there was no strategy, fallback to just calling the callback
  return callback();
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
  // eslint-disable-next-line deprecation/deprecation
  return getGlobalSingleton<Hub>('hub', () => new Hub(), carrier);
}

/**
 * This will set passed {@link Hub} on the passed object's __SENTRY__.hub attribute
 * @param carrier object
 * @param hub Hub
 * @returns A boolean indicating success or failure
 */
export function setHubOnCarrier(carrier: Carrier, hub: Hub): boolean {
  if (!carrier) return false;
  const __SENTRY__ = (carrier.__SENTRY__ = carrier.__SENTRY__ || {});
  __SENTRY__.hub = hub;
  return true;
}
