import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';

const ORIGIN = 'auto.cloudflare.analytics_engine';

export function instrumentAnalyticsEngineWithSentry(
  dataset: AnalyticsEngineDataset,
  bindingName?: string,
): AnalyticsEngineDataset {
  return new Proxy(dataset, {
    get(target, prop, receiver) {
      if (prop === 'writeDataPoint') {
        const original = Reflect.get(target, prop, receiver) as AnalyticsEngineDataset['writeDataPoint'];

        return function (this: unknown, ...args: Parameters<AnalyticsEngineDataset['writeDataPoint']>): void {
          startSpan(
            {
              op: 'cloudflare.analytics_engine',
              name: bindingName ? `writeDataPoint ${bindingName}` : 'writeDataPoint',
              attributes: {
                'cloudflare.analytics_engine.binding_name': bindingName,
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cloudflare.analytics_engine',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
              },
            },
            () => {
              Reflect.apply(original, target, args);
            },
          );
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
