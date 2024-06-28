import type { init } from '@sentry/vue';

// Omitting 'app' as the Nuxt SDK will add the app instance in the client plugin (users do not have to provide this)
export type SentryVueOptions = Omit<Parameters<typeof init>[0] & object, 'app'>;
