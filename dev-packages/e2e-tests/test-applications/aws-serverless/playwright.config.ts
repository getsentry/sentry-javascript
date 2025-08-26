import { getPlaywrightConfig } from '@sentry-internal/test-utils';

export default getPlaywrightConfig(undefined, {
  timeout: 60 * 1000 * 3, // 3 minutes
});
