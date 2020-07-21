// @flow
import { configureScope } from '@sentry/minimal';
import { Scope } from '@sentry/types';
import { Action, AnyAction, PreloadedState, Reducer, StoreEnhancer, StoreEnhancerStoreCreator } from 'redux';

export interface SentryEnhancerOptions {
  /**
   * Transforms the state before attaching it to an event.
   * Use this to remove any private data before sending it to Sentry.
   * Return null to not attach the state.
   */
  stateTransformer(state: any | undefined): any | null;
  /**
   * Transforms the action before sending it as a breadcrumb.
   * Use this to remove any private data before sending it to Sentry.
   * Return null to not send the breadcrumb.
   */
  actionTransformer(action: AnyAction): AnyAction | null;
  /**
   * Called on every state update, configure the Sentry Scope with the redux state.
   */
  configureScopeWithState?(scope: Scope, state: any): void;
}

const ACTION_BREADCRUMB_CATEGORY = 'redux.action';
const ACTION_BREADCRUMB_TYPE = 'info';
const STATE_CONTEXT_KEY = 'redux.state';

const defaultOptions: SentryEnhancerOptions = {
  actionTransformer: action => action,
  // tslint:disable-next-line: no-unsafe-any
  stateTransformer: state => state,
};

function createReduxEnhancer(enhancerOptions?: Partial<SentryEnhancerOptions>): StoreEnhancer {
  const options = {
    ...defaultOptions,
    ...enhancerOptions,
  };

  return (next: StoreEnhancerStoreCreator): StoreEnhancerStoreCreator => <S = any, A extends Action = AnyAction>(
    reducer: Reducer<S, A>,
    initialState?: PreloadedState<S>,
  ) => {
    const sentryReducer: Reducer<S, A> = (state, action): S => {
      const newState = reducer(state, action);

      configureScope(scope => {
        /* Action breadcrumbs */
        const transformedAction = options.actionTransformer(action);
        // tslint:disable-next-line: strict-type-predicates
        if (typeof transformedAction !== 'undefined' && transformedAction !== null) {
          scope.addBreadcrumb({
            category: ACTION_BREADCRUMB_CATEGORY,
            data: transformedAction,
            type: ACTION_BREADCRUMB_TYPE,
          });
        }

        /* Set latest state to scope */
        const transformedState = options.stateTransformer(newState);
        if (typeof transformedState !== 'undefined' && transformedState !== null) {
          // tslint:disable-next-line: no-unsafe-any
          scope.setContext(STATE_CONTEXT_KEY, transformedState);
        } else {
          scope.setContext(STATE_CONTEXT_KEY, null);
        }

        /* Allow user to configure scope with latest state */
        const { configureScopeWithState } = options;
        if (typeof configureScopeWithState === 'function') {
          configureScopeWithState(scope, newState);
        }
      });

      return newState;
    };

    return next(sentryReducer, initialState);
  };
}

export { createReduxEnhancer };
