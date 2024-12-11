import { defineBuildConfig } from 'unbuild';

// Build Config for the Nuxt Module Builder: https://github.com/nuxt/module-builder
export default defineBuildConfig({
  // The devDependency "@sentry-internal/nitro-utils" triggers "Inlined implicit external", but it's not external
  failOnWarn: false,
});
