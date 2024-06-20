import type { init } from '@sentry/vue';

export type SentryVueOptions = Parameters<typeof init>[0] & object;
