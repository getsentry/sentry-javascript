import { addBreadcrumb, addNonEnumerableProperty, getClient, getCurrentScope, getGlobalScope } from '@sentry/core';
import type { Ref } from 'vue';

// Inline Pinia types
type StateTree = Record<string | number | symbol, any>;
type PiniaPlugin = (context: {
  store: {
    $id: string;
    $state: unknown;
    $onAction: (callback: (context: { name: string; after: (callback: () => void) => void }) => void) => void;
  };
  pinia: { state: Ref<Record<string, StateTree>> };
}) => void;

type SentryPiniaPluginOptions = {
  attachPiniaState?: boolean;
  addBreadcrumbs?: boolean;
  actionTransformer?: (action: string) => any;
  stateTransformer?: (state: Record<string, unknown>) => any;
};

export const createSentryPiniaPlugin: (options?: SentryPiniaPluginOptions) => PiniaPlugin = (
  options: SentryPiniaPluginOptions = {
    attachPiniaState: true,
    addBreadcrumbs: true,
    actionTransformer: action => action,
    stateTransformer: state => state,
  },
) => {
  const plugin: PiniaPlugin = ({ store, pinia }) => {
    const getAllStoreStates = (): Record<string, unknown> => {
      const states: Record<string, unknown> = {};

      Object.keys(pinia.state.value).forEach(storeId => {
        states[storeId] = pinia.state.value[storeId];
      });

      return states;
    };

    options.attachPiniaState !== false &&
      getGlobalScope().addEventProcessor((event, hint) => {
        try {
          // Get current timestamp in hh:mm:ss
          const timestamp = new Date().toTimeString().split(' ')[0];
          const filename = `pinia_state_all_stores_${timestamp}.json`;

          hint.attachments = [
            ...(hint.attachments || []),
            {
              filename,
              data: JSON.stringify(getAllStoreStates()),
            },
          ];
        } catch (_) {
          // empty
        }

        return event;
      });

    store.$onAction(context => {
      context.after(() => {
        const transformedActionName = options.actionTransformer
          ? options.actionTransformer(context.name)
          : context.name;

        if (
          typeof transformedActionName !== 'undefined' &&
          transformedActionName !== null &&
          options.addBreadcrumbs !== false
        ) {
          addBreadcrumb({
            category: 'pinia.action',
            message: `Store: ${store.$id} | Action: ${transformedActionName}`,
            level: 'info',
          });
        }

        /* Set latest state of all stores to scope */
        const allStates = getAllStoreStates();
        const transformedState = options.stateTransformer ? options.stateTransformer(allStates) : allStates;
        const scope = getCurrentScope();
        const currentState = scope.getScopeData().contexts.state;

        if (typeof transformedState !== 'undefined' && transformedState !== null) {
          const client = getClient();
          const options = client?.getOptions();
          const normalizationDepth = options?.normalizeDepth || 3; // default state normalization depth to 3
          const piniaStateContext = { type: 'pinia', value: transformedState };

          const newState = {
            ...(currentState || {}),
            state: piniaStateContext,
          };

          addNonEnumerableProperty(
            newState,
            '__sentry_override_normalization_depth__',
            3 + // 3 layers for `state.value.transformedState
              normalizationDepth, // rest for the actual state
          );

          scope.setContext('state', newState);
        } else {
          scope.setContext('state', {
            ...(currentState || {}),
            state: { type: 'pinia', value: 'undefined' },
          });
        }
      });
    });
  };

  return plugin;
};
