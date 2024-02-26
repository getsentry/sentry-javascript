/* eslint-disable deprecation/deprecation */
export { Console } from './console';
export { Http } from './http';
export { OnUncaughtException } from './onuncaughtexception';
export { OnUnhandledRejection } from './onunhandledrejection';
export { Modules } from './modules';
export { ContextLines } from './contextlines';
export { Context } from './context';
export { RequestData } from '@sentry/core';
export { Undici } from './undici';
export { Spotlight } from './spotlight';
export { Hapi } from './hapi';

export {
  captureConsoleIntegration,
  debugIntegration,
  dedupeIntegration,
  extraErrorDataIntegration,
  rewriteFramesIntegration,
  sessionTimingIntegration,
} from '@sentry/core';
