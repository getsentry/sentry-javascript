import { init } from '../../src/sdk/init';
import type { NodeExperimentalClientOptions } from '../../src/types';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

export function mockSdkInit(options?: Partial<NodeExperimentalClientOptions>) {
  global.__SENTRY__ = {};

  init({ dsn: PUBLIC_DSN, defaultIntegrations: false, ...options });
}
