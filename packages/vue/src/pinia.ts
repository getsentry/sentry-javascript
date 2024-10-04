import { addBreadcrumb, getClient, getCurrentScope, getGlobalScope } from '@sentry/core';
import { addNonEnumerableProperty } from '@sentry/utils';

// Inline PiniaPlugin type
type PiniaPlugin = (context: {
  store: {
    $id: string;
    $state: unknown;
    $onAction: (callback: (context: { name: string; after: (callback: () => void) => void }) => void) => void;
  };
}) => void;

type SentryPiniaPluginOptions = {
  attachPiniaState?: boolean;
  addBreadcrumbs?: boolean;
  actionTransformer?: (action: any) => any;
  stateTransformer?: (state: any) => any;
};

export const createSentryPiniaPlugin: (options?: SentryPiniaPluginOptions) => PiniaPlugin = (
  options: SentryPiniaPluginOptions = {
    attachPiniaState: true,
    actionTransformer: action => action,
    stateTransformer: state => state,
  },
) => {
  const plugin: PiniaPlugin = ({ store }) => {
    options.attachPiniaState !== false &&
      getGlobalScope().addEventProcessor((event, hint) => {
        try {
          // Get current timestamp in hh:mm:ss
          const timestamp = new Date().toTimeString().split(' ')[0];
          const filename = `pinia_state_${store.$id}_${timestamp}.json`;

          hint.attachments = [
            ...(hint.attachments || []),
            {
              filename,
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
        const transformedActionName = options.actionTransformer
          ? options.actionTransformer(context.name)
          : context.name;

        if (
          typeof transformedActionName !== 'undefined' &&
          transformedActionName !== null &&
          options.addBreadcrumbs !== false
        ) {
          addBreadcrumb({
            category: 'action',
            message: transformedActionName,
            level: 'info',
          });
        }

        /* Set latest state to scope */
        const transformedState = options.stateTransformer ? options.stateTransformer(store.$state) : store.$state;
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
