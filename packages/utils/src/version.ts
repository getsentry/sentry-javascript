// This is a magic string replaced by rollup
declare const __SENTRY_SDK_VERSION__: string;

export const SDK_VERSION = typeof __SENTRY_SDK_VERSION__ === 'string' ? __SENTRY_SDK_VERSION__ : '0.0.0-unknown.0';
