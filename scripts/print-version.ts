/** Echo the SDK version so that in CI, we can grab it and stick it in an env variable */

import { SDK_VERSION } from '@sentry/core';

// eslint-disable-next-line no-console
console.log(SDK_VERSION);
