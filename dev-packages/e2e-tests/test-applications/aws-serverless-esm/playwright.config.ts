import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// Fix urls not resolving to localhost on Node v17+
// See: https://github.com/axios/axios/issues/3821#issuecomment-1413727575
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

export default getPlaywrightConfig();
