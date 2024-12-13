import { getDefaultCurrentScope, getDefaultIsolationScope } from '../defaultScopes';
import { Scope } from '../scope';
import type { Client, Scope as ScopeInterface } from '../types-hoist';
import { isThenable } from '../utils-hoist/is';
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
  private readonly _stack: [Layer, ...Layer[]];
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

    // scope stack for domains or the process
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
   * Returns the topmost scope layer in the order domain > local > process.
   */
  public getStackTop(): Layer {
    return this._stack[this._stack.length - 1] as Layer;
  }

  /**
   * Push a scope to the stack.
   */
  private _pushScope(): ScopeInterface {
    // We want to clone the content of prev scope
    const scope = this.getScope().clone();
    this._stack.push({
      client: this.getClient(),
      scope,
    });
    return scope;
  }

  /**
   * Pop a scope from the stack.
   */
  private _popScope(): boolean {
    if (this._stack.length <= 1) return false;
    return !!this._stack.pop();
  }
}

/**
 * Get the global async context stack.
 * This will be removed during the v8 cycle and is only here to make migration easier.
 */
function getAsyncContextStack(): AsyncContextStack {
  const registry = getMainCarrier();
  const sentry = getSentryCarrier(registry);

  return (sentry.stack = sentry.stack || new AsyncContextStack(getDefaultCurrentScope(), getDefaultIsolationScope()));
}

function withScope<T>(callback: (scope: ScopeInterface) => T): T {
  return getAsyncContextStack().withScope(callback);
}

function withSetScope<T>(scope: ScopeInterface, callback: (scope: ScopeInterface) => T): T {
  const stack = getAsyncContextStack() as AsyncContextStack;
  return stack.withScope(() => {
    stack.getStackTop().scope = scope;
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
