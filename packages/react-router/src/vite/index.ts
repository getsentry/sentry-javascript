import { sentryReactRouter } from './plugin';

export { sentryReactRouter } from './plugin';
export { sentryOnBuildEnd } from './buildEnd/handleOnBuildEnd';
export type { SentryReactRouterBuildOptions } from './types';
export { makeConfigInjectorPlugin } from './makeConfigInjectorPlugin';

/**
 * Default export of `@sentry/react-router/vite`. It is the same function as {@link sentryReactRouter}.
 */
export default sentryReactRouter;
