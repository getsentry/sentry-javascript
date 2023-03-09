export * from '@sentry/svelte';

// The `withSentryConfig` is exported from the `@sentry/svelte` package, but it has
// nothing to do with the SvelteKit withSentryConfig. (Bad naming on our part)
// const { withSentryConfig, ...restOfTheSDK } = SvelteSDK;

// export { withSentryConfig as whatever };

// export  {
//   ...restOfTheSDK,
// };
