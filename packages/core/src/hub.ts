/* eslint-disable max-lines */
import type {
  Breadcrumb,
  BreadcrumbHint,
  Client,
  Event,
  EventHint,
  Extra,
  Extras,
  Hub as HubInterface,
  Integration,
  IntegrationClass,
  Primitive,
  Scope as ScopeInterface,
  Session,
  SessionContext,
  SeverityLevel,
  User,
} from '@sentry/types';
import { getGlobalSingleton } from '@sentry/utils';
import { GLOBAL_OBJ, consoleSandbox, dateTimestampInSeconds, isThenable, logger, uuid4 } from '@sentry/utils';

import type { AsyncContextStrategy, Carrier } from './asyncContext';
import { getMainCarrier, getSentryCarrier } from './asyncContext';
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

/**
 * A layer in the process stack.
 * @hidden
 */
export interface Layer {
  client?: Client;
  scope: ScopeInterface;
}

/**
 * @inheritDoc
 */
export class Hub implements HubInterface {
  /** Is a {@link Layer}[] containing the client and scope */
  private readonly _stack: Layer[];

  private _isolationScope: ScopeInterface;

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
    scope?: ScopeInterface,
    isolationScope?: ScopeInterface,
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
    if (client) {
      client.init();
    }
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.withScope()` instead.
   */
  public withScope<T>(callback: (scope: ScopeInterface) => T): T {
    const scope = this._pushScope();

    let maybePromiseResult: T;
    try {
      maybePromiseResult = callback(scope);
    } catch (e) {
      this._popScope();
      throw e;
    }

    if (isThenable(maybePromiseResult)) {
      // @ts-expect-error - isThenable returns the wrong type
      return maybePromiseResult.then(
        res => {
          this._popScope();
          return res;
        },
        e => {
          this._popScope();
          throw e;
        },
      );
    }

    this._popScope();
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
  public getScope(): ScopeInterface {
    // eslint-disable-next-line deprecation/deprecation
    return this.getStackTop().scope;
  }

  /**
   * @deprecated Use `Sentry.getIsolationScope()` instead.
   */
  public getIsolationScope(): ScopeInterface {
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
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
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
  public captureMessage(message: string, level?: SeverityLevel, hint?: EventHint): string {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
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
    // eslint-disable-next-line deprecation/deprecation
    this.getScope().captureEvent(event, { ...hint, event_id: eventId });
    return eventId;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use `Sentry.addBreadcrumb()` instead.
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
    // eslint-disable-next-line deprecation/deprecation
    const { client } = this.getStackTop();

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

    client.emit('beforeAddBreadcrumb', finalBreadcrumb, hint);

    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setUser()` instead.
   */
  public setUser(user: User | null): void {
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setUser(user);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setTags()` instead.
   */
  public setTags(tags: { [key: string]: Primitive }): void {
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setTags(tags);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setExtras()` instead.
   */
  public setExtras(extras: Extras): void {
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setExtras(extras);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setTag()` instead.
   */
  public setTag(key: string, value: Primitive): void {
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setTag(key, value);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setExtra()` instead.
   */
  public setExtra(key: string, extra: Extra): void {
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setExtra(key, extra);
  }

  /**
   * @inheritDoc
   * @deprecated Use `Sentry.setContext()` instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setContext(name: string, context: { [key: string]: any } | null): void {
    // eslint-disable-next-line deprecation/deprecation
    this.getIsolationScope().setContext(name, context);
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
      return client.getIntegrationByName<T>(integration.id) || null;
    } catch (_oO) {
      DEBUG_BUILD && logger.warn(`Cannot retrieve integration ${integration.id} from the current Hub`);
      return null;
    }
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
   * Push a scope to the stack.
   */
  private _pushScope(): ScopeInterface {
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
   * Pop a scope from the stack.
   */
  private _popScope(): boolean {
    // eslint-disable-next-line deprecation/deprecation
    if (this.getStack().length <= 1) return false;
    // eslint-disable-next-line deprecation/deprecation
    return !!this.getStack().pop();
  }
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
export function getCurrentHub(): HubInterface {
  // Get main carrier (global for every environment)
  const carrier = getMainCarrier();

  const acs = getAsyncContextStrategy(carrier);
  return acs.getCurrentHub() || getGlobalHub();
}

/** Get the default current scope. */
export function getDefaultCurrentScope(): Scope {
  return getGlobalSingleton('defaultCurrentScope', () => new Scope());
}

/** Get the default isolation scope. */
export function getDefaultIsolationScope(): Scope {
  return getGlobalSingleton('defaultIsolationScope', () => new Scope());
}

/**
 * Get the global hub.
 * This will be removed during the v8 cycle and is only here to make migration easier.
 */
export function getGlobalHub(): HubInterface {
  const registry = getMainCarrier();
  const sentry = getSentryCarrier(registry) as { hub?: HubInterface };

  // If there's no hub, or its an old API, assign a new one
  if (sentry.hub) {
    return sentry.hub;
  }

  // eslint-disable-next-line deprecation/deprecation
  sentry.hub = new Hub(undefined, getDefaultCurrentScope(), getDefaultIsolationScope());
  return sentry.hub;
}

/**
 * Get the current async context strategy.
 * If none has been setup, the default will be used.
 */
export function getAsyncContextStrategy(carrier: Carrier): AsyncContextStrategy {
  const sentry = getSentryCarrier(carrier);

  if (sentry.acs) {
    return sentry.acs;
  }

  // Otherwise, use the default one
  return getHubStackAsyncContextStrategy();
}

function withScope<T>(callback: (scope: ScopeInterface) => T): T {
  // eslint-disable-next-line deprecation/deprecation
  return getGlobalHub().withScope(callback);
}

function withSetScope<T>(scope: ScopeInterface, callback: (scope: ScopeInterface) => T): T {
  const hub = getGlobalHub() as Hub;
  // eslint-disable-next-line deprecation/deprecation
  return hub.withScope(() => {
    // eslint-disable-next-line deprecation/deprecation
    hub.getStackTop().scope = scope as Scope;
    return callback(scope);
  });
}

function withIsolationScope<T>(callback: (isolationScope: ScopeInterface) => T): T {
  // eslint-disable-next-line deprecation/deprecation
  return getGlobalHub().withScope(() => {
    // eslint-disable-next-line deprecation/deprecation
    return callback(getGlobalHub().getIsolationScope());
  });
}

/* eslint-disable deprecation/deprecation */
function getHubStackAsyncContextStrategy(): AsyncContextStrategy {
  return {
    getCurrentHub: getGlobalHub,
    withIsolationScope,
    withScope,
    withSetScope,
    withSetIsolationScope: <T>(_isolationScope: ScopeInterface, callback: (isolationScope: ScopeInterface) => T) => {
      return withIsolationScope(callback);
    },
    getCurrentScope: () => getGlobalHub().getScope(),
    getIsolationScope: () => getGlobalHub().getIsolationScope(),
  };
}
/* eslint-enable deprecation/deprecation */
