import {
  Breadcrumb,
  BreadcrumbHint,
  Client,
  CustomSamplingContext,
  Event,
  EventHint,
  Extra,
  Extras,
  Integration,
  IntegrationClass,
  Primitive,
  SessionContext,
  SeverityLevel,
  Span,
  SpanContext,
  Transaction,
  TransactionContext,
  User,
} from '@sentry/types';
import { consoleSandbox, dateTimestampInSeconds, getGlobalObject, isNodeEnv, logger, uuid4 } from '@sentry/utils';

import { cloneScope, getSession, Scope } from './scope';
import { Session } from './session';

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be increased when the global interface
 * changes and new methods are introduced.
 *
 * @hidden
 */
export const API_VERSION = 4;

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
  scope?: Scope;
}

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: {
    hub?: Hub;
    /**
     * Extra Hub properties injected by various SDKs
     */
    integrations?: Integration[];
    extensions?: {
      /** Hack to prevent bundlers from breaking our usage of the domain package in the cross-platform Hub package */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      domain?: { [key: string]: any };
    } & {
      /** Extension methods for the hub, which are bound to the current Hub instance */
      // eslint-disable-next-line @typescript-eslint/ban-types
      [key: string]: Function;
    };
  };
}

/**
 * @hidden
 * @deprecated Can be removed once `Hub.getActiveDomain` is removed.
 */
export interface DomainAsCarrier extends Carrier {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  members: { [key: string]: any }[];
}

/**
 * Internal class used to make sure we always have the latest internal functions
 * working in case we have a version conflict.
 */
export class Hub {
  /** Is a {@link Layer}[] containing the client and scope */
  public readonly stack: Layer[] = [{}];

  /** Contains the last event id of a captured event.  */
  public lastEventId?: string;

  /**
   * Creates a new instance of the hub, will push one {@link Layer} into the
   * internal stack on creation.
   *
   * @param client bound to the hub.
   * @param scope bound to the hub.
   * @param version number, higher number means higher priority.
   */
  public constructor(client?: Client, scope: Scope = new Scope(), public readonly _version: number = API_VERSION) {
    getStackTop(this).scope = scope;
    if (client) {
      bindClient(this, client);
    }
  }
}

/**
 * Returns the topmost scope layer in the order domain > local > process.
 *
 * @hidden
 * */
export function getStackTop(hub: Hub): Layer {
  return hub.stack[hub.stack.length - 1];
}

/** Returns the scope stack for domains or the process. */
export function getStack(hub: Hub): Layer[] {
  return hub.stack;
}

/**
 * This binds the given client to the current scope.
 * @param hub The Hub instance.
 * @param client An SDK client (client) instance.
 */
export function bindClient(hub: Hub, client?: Client): void {
  const top = getStackTop(hub);
  top.client = client;
  if (client && client.setupIntegrations) {
    client.setupIntegrations();
  }
}

/**
 * Removes a previously pushed scope from the stack.
 *
 * This restores the state before the scope was pushed. All breadcrumbs and
 * context information added since the last call to {@link pushScope} are
 * discarded.
 */
export function popScope(hub: Hub): boolean {
  if (getStack(hub).length <= 1) return false;
  return !!getStack(hub).pop();
}

/**
 * Create a new scope to store context information.
 *
 * The scope will be layered on top of the current one. It is isolated, i.e. all
 * breadcrumbs and context information added to this scope will be removed once
 * the scope ends. Be sure to always remove this scope with {@link popScope}
 * when the operation finishes or throws.
 *
 * @returns Scope, the new cloned scope
 */
export function pushScope(hub: Hub): Scope {
  // We want to clone the content of prev scope
  const scope = cloneScope(getScope(hub));
  getStack(hub).push({
    client: getClient(hub),
    scope,
  });
  return scope;
}

/**
 * Checks if this hub's version is older than the given version.
 *
 * @param hub The hub to check the version on.
 * @param version A version number to compare to.
 * @return True if the given version is newer; otherwise false.
 *
 * @hidden
 */
export function isOlderThan(hub: Hub, version: number): boolean {
  return hub._version < version;
}

/**
 * Creates a new scope with and executes the given operation within.
 * The scope is automatically removed once the operation
 * finishes or throws.
 *
 * This is essentially a convenience function for:
 *
 *     pushScope();
 *     callback();
 *     popScope();
 *
 * @param hub The Hub instance.
 * @param callback that will be enclosed into push/popScope.
 */
export function withScope(hub: Hub, callback: (scope: Scope) => void): void {
  const scope = pushScope(hub);
  try {
    callback(scope);
  } finally {
    popScope(hub);
  }
}

/** Returns the client of the top stack. */
export function getClient<C extends Client>(hub: Hub): C | undefined {
  return getStackTop(hub).client as C;
}

/**
 * Updates user context information for future events.
 *
 * @param hub The Hub instance.
 * @param user User context object to be set in the current context. Pass `null` to unset the user.
 */
export function setUser(hub: Hub, user: User | null): void {
  const scope = getScope(hub);
  if (scope) scope.setUser(user);
}

/** Returns the scope of the top stack. */
export function getScope(hub: Hub): Scope | undefined {
  return getStackTop(hub).scope;
}

/**
 * This is the getter for lastEventId.
 *
 * @returns The last event id of a captured event.
 */
export function lastEventId(hub: Hub): string | undefined {
  return hub.lastEventId;
}

/**
 * Sends the current session on the scope to Sentry
 * @param hub The Hub instance
 * @param shouldEndSession If set the session will be marked as exited and removed from the scope
 */
export function captureSession(hub: Hub, shouldEndSession: boolean = false): void {
  // both send the update and pull the session from the scope
  if (shouldEndSession) {
    return endSession(hub);
  }

  // only send the update
  _sendSessionUpdate(hub);
}

/**
 * Sends the current Session on the scope
 */
function _sendSessionUpdate(hub: Hub): void {
  const { scope, client } = getStackTop(hub);
  if (!scope) return;

  const session = getSession(scope)
  if (session) {
    if (client && client.captureSession) {
      client.captureSession(session);
    }
  }
}

/**
 * Ends the session that lives on the current scope and sends it to Sentry
 */
function endSession(hub: Hub): void {
  const layer = getStackTop(hub);
  const scope = layer && layer.scope;
  const session = getSession(scope);
  if (session) {
    session.close();
  }

  _sendSessionUpdate(hub);

  // the session is over; take it off of the scope
  if (scope) {
    scope.setSession();
  }
}

/**
 * Starts a new `Session`, sets on the current scope and returns it.
 *
 * To finish a `session`, it has to be passed directly to `client.captureSession`, which is done automatically
 * when using `endSession(hub)` for the session currently stored on the scope.
 *
 * When there's already an existing session on the scope, it'll be automatically ended.
 *
 * @param hub The Hub instance.
 * @param context Optional properties of the new `Session`.
 *
 * @returns The session which was just started
 */
export function startSession(hub: Hub, context?: SessionContext): Session {
  const { scope, client } = getStackTop(hub);
  const { release, environment } = (client && client.getOptions()) || {};

  // Will fetch userAgent if called from browser sdk
  const global = getGlobalObject<{ navigator?: { userAgent?: string } }>();
  const { userAgent } = global.navigator || {};

  const session = new Session({
    release,
    environment,
    ...(scope && { user: scope.getUser() }),
    ...(userAgent && { userAgent }),
    ...context,
  });

  if (scope) {
    // End existing session if there's one
    const currentSession = getSession(scope);
    if (currentSession && currentSession.status === 'ok') {
      currentSession.update({ status: 'exited' });
    }
    endSession(hub);

    // Afterwards we set the new session on the scope
    scope.setSession(session);
  }

  return session;
}

/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param hub The Hub instance.
 * @param exception An exception-like object.
 * @param hint May contain additional information about the original exception.
 * @returns The generated eventId.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function captureException(hub: Hub, exception: any, hint?: EventHint): string {
  const eventId = (hub.lastEventId = uuid4());
  let finalHint = hint;

  // If there's no explicit hint provided, mimic the same thing that would happen
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

  _invokeClient(hub, 'captureException', exception, {
    ...finalHint,
    event_id: eventId,
  });
  return eventId;
}

/**
 * Captures a message event and sends it to Sentry.
 *
 * @param hub The Hub instance.
 * @param message The message to send to Sentry.
 * @param level Define the level of the message.
 * @param hint May contain additional information about the original exception.
 * @returns The generated eventId.
 */
export function captureMessage(hub: Hub, message: string, level?: SeverityLevel, hint?: EventHint): string {
  const eventId = (hub.lastEventId = uuid4());
  let finalHint = hint;

  // If there's no explicit hint provided, mimic the same thing that would happen
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

  _invokeClient(hub, 'captureMessage', message, level, {
    ...finalHint,
    event_id: eventId,
  });
  return eventId;
}

/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param hub The Hub instance.
 * @param event The event to send to Sentry.
 * @param hint May contain additional information about the original exception.
 */
export function captureEvent(hub: Hub, event: Event, hint?: EventHint): string {
  const eventId = uuid4();
  if (event.type !== 'transaction') {
    hub.lastEventId = eventId;
  }

  _invokeClient(hub, 'captureEvent', event, {
    ...hint,
    event_id: eventId,
  });
  return eventId;
}

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 *
 * @param hub The Hub instance.
 * @param breadcrumb The breadcrumb to record.
 * @param hint May contain additional information about the original breadcrumb.
 */
export function addBreadcrumb(hub: Hub, breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
  const { scope, client } = getStackTop(hub);

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

  scope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
}

/**
 * Set an object that will be merged sent as tags data with the event.
 *
 * @param hub The Hub instance.
 * @param tags Tags context object to merge into current context.
 */
export function setTags(hub: Hub, tags: { [key: string]: Primitive }): void {
  const scope = getScope(hub);
  if (scope) scope.setTags(tags);
}

/**
 * Set an object that will be merged sent as extra data with the event.
 * @param hub The Hub instance.
 * @param extras Extras object to merge into current context.
 */
export function setExtras(hub: Hub, extras: Extras): void {
  const scope = getScope(hub);
  if (scope) scope.setExtras(extras);
}

/**
 * Set key:value that will be sent as tags data with the event.
 *
 * Can also be used to unset a tag, by passing `undefined`.
 *
 * @param hub The Hub instance.
 * @param key String key of tag
 * @param value Value of tag
 */
export function setTag(hub: Hub, key: string, value: Primitive): void {
  const scope = getScope(hub);
  if (scope) scope.setTag(key, value);
}

/**
 * Set key:value that will be sent as extra data with the event.
 * @param hub The Hub instance.
 * @param key String of extra
 * @param extra Any kind of data. This data will be normalized.
 */
export function setExtra(hub: Hub, key: string, extra: Extra): void {
  const scope = getScope(hub);
  if (scope) scope.setExtra(key, extra);
}

/**
 * Sets context data with the given name.
 * @param hub The Hub instance.
 * @param name of the context
 * @param context Any kind of data. This data will be normalized.
 */
export function setContext(hub: Hub, name: string, context: { [key: string]: any } | null): void {
  const scope = getScope(hub);
  if (scope) scope.setContext(name, context);
}

/**
 * Callback to set context information onto the scope.
 *
 * @param hub The Hub instance.
 * @param callback Callback function that receives Scope.
 */
export function configureScope(hub: Hub, callback: (scope: Scope) => void): void {
  const { scope, client } = getStackTop(hub);
  if (scope && client) {
    callback(scope);
  }
}

/**
 * For the duration of the callback, this hub will be set as the global current Hub.
 * This function is useful if you want to run your own client and hook into an already initialized one
 * e.g.: Reporting issues to your own sentry when running in your component while still using the users configuration.
 */
export function run(hub: Hub, callback: (hub: Hub) => void): void {
  const oldHub = makeMain(hub);
  try {
    callback(hub);
  } finally {
    makeMain(oldHub);
  }
}

/** Returns the integration if installed on the current client. */
export function getIntegration<T extends Integration>(hub: Hub, integration: IntegrationClass<T>): T | null {
  const client = getClient(hub);
  if (!client) return null;
  try {
    return client.getIntegration(integration);
  } catch (_oO) {
    logger.warn(`Cannot retrieve integration ${integration.id} from the current Hub`);
    return null;
  }
}

/**
 * @deprecated No longer does anything. Use use {@link Transaction.startChild} instead.
 */
export function startSpan(hub: Hub, context: SpanContext): Span {
  return _callExtensionMethod(hub, 'startSpan', context);
}

/**
 * Starts a new `Transaction` and returns it. This is the entry point to manual tracing instrumentation.
 *
 * A tree structure can be built by adding child spans to the transaction, and child spans to other spans. To start a
 * new child span within the transaction or any span, call the respective `.startChild()` method.
 *
 * Every child span must be finished before the transaction is finished, otherwise the unfinished spans are discarded.
 *
 * The transaction must be finished with a call to its `.finish()` method, at which point the transaction with all its
 * finished child spans will be sent to Sentry.
 *
 * @param hub The Hub i
 * @param context Properties of the new `Transaction`.
 * @param customSamplingContext Information given to the transaction sampling function (along with context-dependent
 * default values). See {@link Options.tracesSampler}.
 *
 * @returns The transaction which was just started
 */
export function startTransaction(hub: Hub, context: TransactionContext, customSamplingContext?: CustomSamplingContext): Transaction {
  return _callExtensionMethod(hub, 'startTransaction', context, customSamplingContext);
}

/** Returns all trace headers that are currently on the top scope. */
export function traceHeaders(hub: Hub): { [key: string]: string } {
  return _callExtensionMethod<{ [key: string]: string }>(hub, 'traceHeaders');
}

/**
 * Internal helper function to call a method on the top client if it exists.
 *
 * @param method The method to call on the client.
 * @param args Arguments to pass to the client function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _invokeClient<M extends keyof Client>(hub: Hub, method: M, ...args: any[]): void {
  const { scope, client } = getStackTop(hub);
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
function _callExtensionMethod<T>(hub: Hub, method: string, ...args: any[]): T {
  const carrier = getMainCarrier();
  const sentry = carrier.__SENTRY__;
  if (sentry && sentry.extensions && typeof sentry.extensions[method] === 'function') {
    return sentry.extensions[method].apply(hub, args);
  }
  logger.warn(`Extension method ${method} couldn't be found, doing nothing.`);
}

/**
 * Returns the global shim registry.
 *
 * FIXME: This function is problematic, because despite always returning a valid Carrier,
 * it has an optional `__SENTRY__` property, which then in turn requires us to always perform an unnecessary check
 * at the call-site. We always access the carrier through this function, so we can guarantee that `__SENTRY__` is there.
 **/
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
  if (!hasHubOnCarrier(registry) || isOlderThan(getHubFromCarrier(registry), API_VERSION)) {
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
    const sentry = getMainCarrier().__SENTRY__;
    const activeDomain = sentry && sentry.extensions && sentry.extensions.domain && sentry.extensions.domain.active;

    // If there's no active domain, just return global hub
    if (!activeDomain) {
      return getHubFromCarrier(registry);
    }

    // If there's no hub on current domain, or it's an old API, assign a new one
    if (!hasHubOnCarrier(activeDomain) || isOlderThan(getHubFromCarrier(activeDomain), API_VERSION)) {
      const registryHubTopStack = getStackTop(getHubFromCarrier(registry));
      setHubOnCarrier(activeDomain, new Hub(registryHubTopStack.client, cloneScope(registryHubTopStack.scope)));
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
