// TODO: could we just put everything in a types.ts file?

import type { LDClient } from 'launchdarkly-js-client-sdk';

export type LaunchDarklyOptions = {
  ldClient: LDClient;
};
