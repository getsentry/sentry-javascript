/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Scope } from '@sentry/core';
import { addBreadcrumb, addNonEnumerableProperty, getClient, getCurrentScope, getGlobalScope } from '@sentry/core';

interface Action<T = any> {
  type: T;
}

interface AnyAction extends Action {
  [extraProps: string]: any;
}

type Reducer<S = any, A extends Action = AnyAction> = (state: S | undefined, action: A) => S;

type Dispatch<A extends Action = AnyAction> = <T extends A>(action: T, ...extraArgs: any[]) => T;

type ExtendState<State, Extension> = [Extension] extends [never] ? State : State & Extension;

type Unsubscribe = () => void;

interface Store<S = any, A extends Action = AnyAction, StateExt = never, Ext = Record<string, unknown>> {
  dispatch: Dispatch<A>;
  getState(): S;
  subscribe(listener: () => void): Unsubscribe;
  replaceReducer<NewState, NewActions extends Action>(
    nextReducer: Reducer<NewState, NewActions>,
  ): Store<ExtendState<NewState, StateExt>, NewActions, StateExt, Ext> & Ext;
}

declare const $CombinedState: unique symbol;

type CombinedState<S> = { readonly [$CombinedState]?: undefined } & S;

type PreloadedState<S> =
  Required<S> extends {
    [$CombinedState]: undefined;
  }
    ? S extends CombinedState<infer S1>
      ? { [K in keyof S1]?: S1[K] extends Record<string, unknown> ? PreloadedState<S1[K]> : S1[K] }
      : never
    : { [K in keyof S]: S[K] extends string | number | boolean | symbol ? S[K] : PreloadedState<S[K]> };

type StoreEnhancerStoreCreator<Ext = Record<string, unknown>, StateExt = never> = <
  S = any,
  A extends Action = AnyAction,
>(
  reducer: Reducer<S, A>,
  preloadedState?: PreloadedState<S>,
) => Store<ExtendState<S, StateExt>, A, StateExt, Ext> & Ext;

export interface SentryEnhancerOptions<S = any> {
  /**
   * Redux state in attachments or not.
   * @default true
   */
  attachReduxState?: boolean;

  /**
   * Transforms the state before attaching it to an event.
   * Use this to remove any private data before sending it to Sentry.
   * Return null to not attach the state.
   */
  stateTransformer(state: S | undefined): (S & any) | null;
  /**
   * Transforms the action before sending it as a breadcrumb.
   * Use this to remove any private data before sending it to Sentry.
   * Return null to not send the breadcrumb.
   */
  actionTransformer(action: AnyAction): AnyAction | null;
  /**
   * Called on every state update, configure the Sentry Scope with the redux state.
   */
  configureScopeWithState?(scope: Scope, state: S): void;
}

const ACTION_BREADCRUMB_CATEGORY = 'redux.action';
const ACTION_BREADCRUMB_TYPE = 'info';

const defaultOptions: SentryEnhancerOptions = {
  attachReduxState: true,
  actionTransformer: action => action,
  stateTransformer: state => state || null,
};

/**
 * Creates an enhancer that would be passed to Redux's createStore to log actions and the latest state to Sentry.
 *
 * @param enhancerOptions Options to pass to the enhancer
 */
function createReduxEnhancer(enhancerOptions?: Partial<SentryEnhancerOptions>): any {
  // Note: We return an any type as to not have type conflicts.
  const options = {
    ...defaultOptions,
    ...enhancerOptions,
  };

  return (next: StoreEnhancerStoreCreator): StoreEnhancerStoreCreator =>
    <S = any, A extends Action = AnyAction>(reducer: Reducer<S, A>, initialState?: PreloadedState<S>) => {
      options.attachReduxState &&
        getGlobalScope().addEventProcessor((event, hint) => {
          try {
            // @ts-expect-error try catch to reduce bundle size
            if (event.type === undefined && event.contexts.state.state.type === 'redux') {
              hint.attachments = [
                ...(hint.attachments || []),
                // @ts-expect-error try catch to reduce bundle size
                { filename: 'redux_state.json', data: JSON.stringify(event.contexts.state.state.value) },
              ];
            }
          } catch {
            // empty
          }
          return event;
        });

      function sentryWrapReducer(reducer: Reducer<S, A>): Reducer<S, A> {
        return (state, action): S => {
          const newState = reducer(state, action);

          const scope = getCurrentScope();

          /* Action breadcrumbs */
          const transformedAction = options.actionTransformer(action);
          if (typeof transformedAction !== 'undefined' && transformedAction !== null) {
            addBreadcrumb({
              category: ACTION_BREADCRUMB_CATEGORY,
              data: transformedAction,
              type: ACTION_BREADCRUMB_TYPE,
            });
          }

          /* Set latest state to scope */
          const transformedState = options.stateTransformer(newState);
          if (typeof transformedState !== 'undefined' && transformedState !== null) {
            const client = getClient();
            const options = client?.getOptions();
            const normalizationDepth = options?.normalizeDepth || 3; // default state normalization depth to 3

            // Set the normalization depth of the redux state to the configured `normalizeDepth` option or a sane number as a fallback
            const newStateContext = { state: { type: 'redux', value: transformedState } };
            addNonEnumerableProperty(
              newStateContext,
              '__sentry_override_normalization_depth__',
              3 + // 3 layers for `state.value.transformedState`
                normalizationDepth, // rest for the actual state
            );

            scope.setContext('state', newStateContext);
          } else {
            scope.setContext('state', null);
          }

          /* Allow user to configure scope with latest state */
          const { configureScopeWithState } = options;
          if (typeof configureScopeWithState === 'function') {
            configureScopeWithState(scope, newState);
          }

          return newState;
        };
      }

      const store = next(sentryWrapReducer(reducer), initialState);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      store.replaceReducer = new Proxy(store.replaceReducer, {
        apply: function (target, thisArg, args) {
          target.apply(thisArg, [sentryWrapReducer(args[0])]);
        },
      });

      return store;
    };
}

export { createReduxEnhancer };
