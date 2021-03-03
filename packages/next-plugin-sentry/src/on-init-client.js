import { init } from '@sentry/nextjs';
import getConfig from 'next/config';

import { getDsn, getRelease } from '../env';
import { clientConfig } from '../config';

export default async function initClient() {
  const { publicRuntimeConfig = {} } = getConfig() || {};
  const runtimeConfig = publicRuntimeConfig.sentry || {};

  init({
    dsn: getDsn(),
    ...(getRelease() && { release: getRelease() }),
    ...runtimeConfig,
    ...clientConfig,
  });
}
