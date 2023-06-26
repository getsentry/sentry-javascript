import type { DynamicSamplingContext, Hub } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { DEFAULT_ENVIRONMENT } from '../constants';
import { getCurrentHub } from '../hub';

/**
 * Create a dynamic sampling context from a hub.
 */
export function dynamicSamplingContextFromHub(
  trace_id: string,
  hub: Hub = getCurrentHub(),
): Partial<DynamicSamplingContext> {
  const client = hub.getClient();
  if (!client) {
    return {};
  }

  const { environment = DEFAULT_ENVIRONMENT, release } = client.getOptions() || {};
  const { publicKey: public_key } = client.getDsn() || {};

  const { segment: user_segment } = hub.getScope().getUser() || {};

  const dsc = dropUndefinedKeys({
    environment,
    release,
    user_segment,
    public_key,
    trace_id,
  });

  client.emit && client.emit('createDsc', dsc);

  return dsc;
}
