import * as Sentry from './lib/sentry';

export default Sentry;
export { default as Client, Adapter, Options } from './lib/client';
export { default as DSN } from './lib/dsn';
export { default as SentryError } from './lib/error';
export * from './lib/interfaces';
