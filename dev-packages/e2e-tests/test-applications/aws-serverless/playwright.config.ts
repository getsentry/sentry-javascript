import { getPlaywrightConfig } from '@sentry-internal/test-utils';

export default getPlaywrightConfig(undefined, {
  timeout: 100000,
});
