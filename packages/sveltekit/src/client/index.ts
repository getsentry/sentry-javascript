export * from '@sentry/svelte';

export { init } from './sdk';
export { handleErrorWithSentry } from './handleError';

// Just here so that eslint is happy until we export more stuff here
export const PLACEHOLDER_CLIENT = 'PLACEHOLDER';
