import { addBreadcrumb, addNonEnumerableProperty, getClient, getCurrentScope, getGlobalScope } from '@sentry/core';
import type { Ref } from 'vue';

// Inline Pinia types
type StateTree = Record<string | number | symbol, unknown>;
type PiniaPlugin = (context: {
  store: {
    $id: string;
    $state: unknown;
    $onAction: (callback: (context: { name: string; after: (callback: () => void) => void }) => void) => void;
  };
  pinia: { state: Ref<Record<string, StateTree>> };
}) => void;

type SentryPiniaPluginOptions = {
  attachPiniaState: boolean;
  addBreadcrumbs: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionTransformer: (action: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateTransformer: (state: Record<string, unknown>) => any;
};

const DEFAULT_PINIA_PLUGIN_OPTIONS: SentryPiniaPluginOptions = {
  attachPiniaState: true,
  addBreadcrumbs: true,
  actionTransformer: action => action,
  stateTransformer: state => state,
};

const getAllStoreStates = (
  pinia: { state: Ref<Record<string, StateTree>> },
  stateTransformer?: SentryPiniaPluginOptions['stateTransformer'],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  const states: Record<string, unknown> = {};

  try {
    Object.keys(pinia.state.value).forEach(storeId => {
      states[storeId] = pinia.state.value[storeId];
    });

    return stateTransformer ? stateTransformer(states) : states;
  } catch {
    return states;
  }
};

export const createSentryPiniaPlugin: (
  userOptions?: Partial<SentryPiniaPluginOptions>,
) => PiniaPlugin = userOptions => {
  const options: SentryPiniaPluginOptions = { ...DEFAULT_PINIA_PLUGIN_OPTIONS, ...userOptions };

  const plugin: PiniaPlugin = ({ store, pinia }) => {
    options.attachPiniaState !== false &&
      getGlobalScope().addEventProcessor((event, hint) => {
        try {
          // Get current timestamp in hh:mm:ss
          const timestamp = new Date().toTimeString().split(' ')[0];
          const filename = `pinia_state_all_stores_${timestamp}.json`;

          // event processor runs for each pinia store - attachment should only be added once per event
          const hasExistingPiniaStateAttachment = hint.attachments?.some(attachment =>
            attachment.filename.startsWith('pinia_state_all_stores_'),
          );

          if (!hasExistingPiniaStateAttachment) {
            hint.attachments = [
              ...(hint.attachments || []),
              {
                filename,
                data: JSON.stringify(getAllStoreStates(pinia, options.stateTransformer)),
              },
            ];
          }
        } catch {
          // empty
        }

        return event;
      });

    store.$onAction(context => {
      context.after(() => {
        const transformedActionName = options.actionTransformer(context.name);

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
        const allStates = getAllStoreStates(pinia, options.stateTransformer);
        const scope = getCurrentScope();
        const currentState = scope.getScopeData().contexts.state;

        if (typeof allStates !== 'undefined' && allStates !== null) {
          const client = getClient();
          const options = client?.getOptions();
          const normalizationDepth = options?.normalizeDepth || 3; // default state normalization depth to 3
          const piniaStateContext = { type: 'pinia', value: allStates };

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
