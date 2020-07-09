// @flow
import * as Sentry from '@sentry/browser';
import * as Redux from 'redux';

export interface SentryEnhancerOptions {
  /**
   * Transforms the state before attaching it to an event.
   * Use this to remove any private data before sending it to Sentry.
   * Return null to not attach the state.
   */
  stateTransformer(state: any | undefined): any | null | void;
  /**
   * Transforms the action before sending it as a breadcrumb.
   * Use this to remove any private data before sending it to Sentry.
   * Return null to not send the breadcrumb.
   */
  actionTransformer(action: Redux.AnyAction): Redux.AnyAction | null | void;
  /**
   * Category of the breadcrumb sent by actions. Default is 'redux.action'
   */
  actionBreadcrumbCategory: string;
  /**
   * Type of the breadcrumb sent by actions. Default is 'info'
   */
  actionBreadcrumbType: string;
  /**
   * The extra key to pass the state to. Default is 'redux.state'
   */
  stateExtraKey: string;
  /**
   * Called on every state update, configure the Sentry Scope with the redux state.
   */
  configureScopeWithState?(scope: Sentry.Scope, state: any): void;
}

const defaultOptions: SentryEnhancerOptions = {
  actionBreadcrumbCategory: 'redux.action',
  actionBreadcrumbType: 'info',
  actionTransformer: action => action,
  stateExtraKey: 'redux.state',
  // tslint:disable-next-line: no-unsafe-any
  stateTransformer: state => state,
};

function createReduxEnhancer(enhancerOptions?: Partial<SentryEnhancerOptions>): Redux.StoreEnhancer {
  const options = {
    ...defaultOptions,
    ...enhancerOptions,
  };

  return (next: Redux.StoreEnhancerStoreCreator): Redux.StoreEnhancerStoreCreator => <
    S = any,
    A extends Redux.Action = Redux.AnyAction
  >(
    reducer: Redux.Reducer<S, A>,
    initialState?: Redux.PreloadedState<S>,
  ) => {
    const sentryReducer: Redux.Reducer<S, A> = (state, action): S => {
      const newState = reducer(state, action);

      Sentry.configureScope(scope => {
        /* Action breadcrumbs */
        const transformedAction = options.actionTransformer ? options.actionTransformer(action) : action;
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
          scope.setExtra(options.stateExtraKey, transformedState);
        } else {
          scope.setExtra(options.stateExtraKey, undefined);
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
