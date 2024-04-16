import type { Client, Scope as ScopeInterface } from '@sentry/types';
import { getGlobalSingleton } from '@sentry/utils';
import { isThenable } from '@sentry/utils';

import type { AsyncContextStrategy, Carrier } from './asyncContext';
import { getMainCarrier, getSentryCarrier } from './asyncContext';
import { Scope } from './scope';
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
 * A layer in the process stack.
 * @hidden
 */
export interface Layer {
  client?: Client;
  scope: ScopeInterface;
}

/**
 * This is an object that holds a stack of scopes.
 */
export class AsyncContextStack {
  private readonly _stack: Layer[];

  private _isolationScope: ScopeInterface;

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
      this.bindClient(client);
    }

    this._isolationScope = assignedIsolationScope;
  }

  /**
   * This binds the given client to the current scope.
   */
  public bindClient(client?: Client): void {
    const top = this.getStackTop();
    top.client = client;
    top.scope.setClient(client);
    if (client) {
      client.init();
    }
  }

  /**
   * Fork a scope for the stack.
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
   * Get the client of the stack.
   */
  public getClient<C extends Client>(): C | undefined {
    return this.getStackTop().client as C;
  }

  /**
   * Returns the scope of the top stack.
   */
  public getScope(): ScopeInterface {
    return this.getStackTop().scope;
  }

  /**
   * Get the isolation scope for the stack.
   */
  public getIsolationScope(): ScopeInterface {
    return this._isolationScope;
  }

  /**
   * Returns the scope stack for domains or the process.
   */
  public getStack(): Layer[] {
    return this._stack;
  }

  /**
   * Returns the topmost scope layer in the order domain > local > process.
   */
  public getStackTop(): Layer {
    return this._stack[this._stack.length - 1];
  }

  /**
   * Push a scope to the stack.
   */
  private _pushScope(): ScopeInterface {
    // We want to clone the content of prev scope
    const scope = this.getScope().clone();
    this.getStack().push({
      client: this.getClient(),
      scope,
    });
    return scope;
  }

  /**
   * Pop a scope from the stack.
   */
  private _popScope(): boolean {
    if (this.getStack().length <= 1) return false;
    return !!this.getStack().pop();
  }
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
 * Get the global async context stack.
 * This will be removed during the v8 cycle and is only here to make migration easier.
 */
function getAsyncContextStack(): AsyncContextStack {
  const registry = getMainCarrier();
  const sentry = getSentryCarrier(registry) as { hub?: AsyncContextStack };

  // If there's no hub, or its an old API, assign a new one
  if (sentry.hub) {
    return sentry.hub;
  }

  sentry.hub = new AsyncContextStack(undefined, getDefaultCurrentScope(), getDefaultIsolationScope());
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
  return getStackAsyncContextStrategy();
}

function withScope<T>(callback: (scope: ScopeInterface) => T): T {
  return getAsyncContextStack().withScope(callback);
}

function withSetScope<T>(scope: ScopeInterface, callback: (scope: ScopeInterface) => T): T {
  const hub = getAsyncContextStack() as AsyncContextStack;
  return hub.withScope(() => {
    hub.getStackTop().scope = scope as Scope;
    return callback(scope);
  });
}

function withIsolationScope<T>(callback: (isolationScope: ScopeInterface) => T): T {
  return getAsyncContextStack().withScope(() => {
    return callback(getAsyncContextStack().getIsolationScope());
  });
}

function getStackAsyncContextStrategy(): AsyncContextStrategy {
  return {
    withIsolationScope,
    withScope,
    withSetScope,
    withSetIsolationScope: <T>(_isolationScope: ScopeInterface, callback: (isolationScope: ScopeInterface) => T) => {
      return withIsolationScope(callback);
    },
    getCurrentScope: () => getAsyncContextStack().getScope(),
    getIsolationScope: () => getAsyncContextStack().getIsolationScope(),
  };
}
