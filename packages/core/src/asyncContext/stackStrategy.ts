import type { Client, Scope as ScopeInterface } from '@sentry/types';
import { isThenable } from '@sentry/utils';
import { getDefaultCurrentScope, getDefaultIsolationScope } from '../currentScopes';
import { Scope } from '../scope';

import { getMainCarrier, getSentryCarrier } from './../carrier';
import type { AsyncContextStrategy } from './types';

interface Layer {
  client?: Client;
  scope: ScopeInterface;
}

/**
 * This is an object that holds a stack of scopes.
 */
export class AsyncContextStack {
  private readonly _stack: Layer[];
  private _isolationScope: ScopeInterface;

  public constructor(scope?: ScopeInterface, isolationScope?: ScopeInterface) {
    let assignedScope;
    if (!scope) {
      assignedScope = new Scope();
    } else {
      assignedScope = scope;
    }

    let assignedIsolationScope;
    if (!isolationScope) {
      assignedIsolationScope = new Scope();
    } else {
      assignedIsolationScope = isolationScope;
    }

    this._stack = [{ scope: assignedScope }];
    this._isolationScope = assignedIsolationScope;
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

/**
 * Get the global async context stack.
 * This will be removed during the v8 cycle and is only here to make migration easier.
 */
function getAsyncContextStack(): AsyncContextStack {
  const registry = getMainCarrier();

  // For now we continue to keep this as `hub` on the ACS,
  // as e.g. the Loader Script relies on this.
  // Eventually we may change this if/when we update the loader to not require this field anymore
  // Related, we also write to `hub` in {@link ./../sdk.ts registerClientOnGlobalHub}
  const sentry = getSentryCarrier(registry) as { hub?: AsyncContextStack };

  if (sentry.hub) {
    return sentry.hub;
  }

  sentry.hub = new AsyncContextStack(getDefaultCurrentScope(), getDefaultIsolationScope());
  return sentry.hub;
}

function withScope<T>(callback: (scope: ScopeInterface) => T): T {
  return getAsyncContextStack().withScope(callback);
}

function withSetScope<T>(scope: ScopeInterface, callback: (scope: ScopeInterface) => T): T {
  const hub = getAsyncContextStack() as AsyncContextStack;
  return hub.withScope(() => {
    hub.getStackTop().scope = scope;
    return callback(scope);
  });
}

function withIsolationScope<T>(callback: (isolationScope: ScopeInterface) => T): T {
  return getAsyncContextStack().withScope(() => {
    return callback(getAsyncContextStack().getIsolationScope());
  });
}

/**
 * Get the stack-based async context strategy.
 */
export function getStackAsyncContextStrategy(): AsyncContextStrategy {
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
