import type { init } from '@sentry/vue';

export type SentryVueOptions = Omit<Parameters<typeof init>[0] & object, 'app'>;
