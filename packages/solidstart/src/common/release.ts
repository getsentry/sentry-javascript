/** Name of the `<meta>` tag through which the server hands the release to the browser SDK. */
export const RELEASE_META_TAG_NAME = 'sentry-release';

/** Set by the server bundle's banner on SolidStart 1, read by the Nitro plugin that adds the `<meta>` tag. */
export const RELEASE_GLOBAL = '__sentry_solidstart_release';
