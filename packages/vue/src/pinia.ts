import { addBreadcrumb, getClient, getCurrentScope, getGlobalScope } from '@sentry/core';
import { addNonEnumerableProperty } from '@sentry/utils';

// Inline PiniaPlugin type
type PiniaPlugin = (context: {
  store: {
    $state: unknown;
    $onAction: (callback: (context: { name: string; after: (callback: () => void) => void }) => void) => void;
  };
}) => void;

type SentryPiniaPluginOptions = {
  attachPiniaState?: boolean;
  actionTransformer: (action: any) => any;
  stateTransformer: (state: any) => any;
};

export const createSentryPiniaPlugin: (options?: SentryPiniaPluginOptions) => PiniaPlugin = (
  options: SentryPiniaPluginOptions = {
    attachPiniaState: true,
    actionTransformer: action => action,
    stateTransformer: state => state,
  },
) => {
  const plugin: PiniaPlugin = ({ store }) => {
    options.attachPiniaState &&
      getGlobalScope().addEventProcessor((event, hint) => {
        try {
          hint.attachments = [
            ...(hint.attachments || []),
            {
              filename: 'pinia_state.json',
              data: JSON.stringify(store.$state),
            },
          ];
        } catch (_) {
          // empty
        }

        return event;
      });

    store.$onAction(context => {
      context.after(() => {
        const transformedAction = options.actionTransformer(context.name);

        if (typeof transformedAction !== 'undefined' && transformedAction !== null) {
          addBreadcrumb({
            category: 'action',
            message: transformedAction,
            level: 'info',
          });
        }

        /* Set latest state to scope */
        const transformedState = options.stateTransformer(store.$state);
        const scope = getCurrentScope();

        if (typeof transformedState !== 'undefined' && transformedState !== null) {
          const client = getClient();
          const options = client && client.getOptions();
          const normalizationDepth = (options && options.normalizeDepth) || 3; // default state normalization depth to 3

          const newStateContext = { state: { type: 'pinia', value: transformedState } };

          addNonEnumerableProperty(
            newStateContext,
            '__sentry_override_normalization_depth__',
            3 + // 3 layers for `state.value.transformedState
              normalizationDepth, // rest for the actual state
          );

          scope.setContext('state', newStateContext);
        } else {
          scope.setContext('state', null);
        }
      });
    });
  };

  return plugin;
};
