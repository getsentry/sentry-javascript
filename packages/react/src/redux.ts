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
   * Category of the breadcrumb sent by actions. Default is 'redux.action'
   */
  actionBreadcrumbCategory: string;
  /**
   * Type of the breadcrumb sent by actions. Default is 'info'
   */
  actionBreadcrumbType: string;
  /**
   * The context key to pass the state to. Default is 'redux.state'
   */
  stateContextKey: string;
  /**
   * Called on every state update, configure the Sentry Scope with the redux state.
   */
  configureScopeWithState?(scope: Scope, state: any): void;
}

const defaultOptions: SentryEnhancerOptions = {
  actionBreadcrumbCategory: 'redux.action',
  actionBreadcrumbType: 'info',
  actionTransformer: action => action,
  stateContextKey: 'redux.state',
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
        const transformedAction = options.actionTransformer ? options.actionTransformer(action) : action;
        // tslint:disable-next-line: strict-type-predicates
        if (typeof transformedAction !== 'undefined' && transformedAction !== null) {
          scope.addBreadcrumb({
            category: options.actionBreadcrumbCategory,
            data: transformedAction,
            type: options.actionBreadcrumbType,
          });
        }

        /* Set latest state to scope */
        const transformedState = options.stateTransformer ? options.stateTransformer(newState) : newState;
        if (typeof transformedState !== 'undefined' && transformedState !== null) {
          // tslint:disable-next-line: no-unsafe-any
          scope.setContext(options.stateContextKey, transformedState);
        } else {
          scope.setContext(options.stateContextKey, null);
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
