import type { DynamicSamplingContext } from '@sentry/types';

import { DEFAULT_ENVIRONMENT } from '../constants';
import { getCurrentHub } from '../hub';

type PartialDsc = Partial<Pick<DynamicSamplingContext, 'environment' | 'release' | 'user_segment' | 'public_key'>>;

/** */
export function getDynamicSamplingContextFromHub(hub = getCurrentHub()): PartialDsc {
  const client = hub.getClient();
  if (!client) {
    return {};
  }

  const { environment = DEFAULT_ENVIRONMENT, release } = client.getOptions() || {};
  const { publicKey: public_key } = client.getDsn() || {};

  const { segment: user_segment } = hub.getScope().getUser() || {};

  return {
    environment,
    release,
    user_segment,
    public_key,
  };
}
