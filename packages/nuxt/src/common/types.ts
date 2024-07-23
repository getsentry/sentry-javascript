import type { Options } from '@sentry/types';
import type { init } from '@sentry/vue';

// Omitting 'app' as the Nuxt SDK will add the app instance in the client plugin (users do not have to provide this)
export type SentryNuxtOptions = Omit<Parameters<typeof init>[0] & object, 'app'>;

type SourceMapsOptions = {
  /**
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   *
   * These options are always read from the `sentry` module options in the `nuxt.config.(js|ts).
   * Do not define them in the `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
   */
  sourceMapsUploadOptions?: {
    /**
     * If this flag is `true`, and an auth token is detected, the Sentry integration will
     * automatically generate and upload source maps to Sentry during a production build.
     *
     * @default true
     */
    enabled?: boolean;

    /**
     * The auth token to use when uploading source maps to Sentry.
     *
     * Instead of specifying this option, you can also set the `SENTRY_AUTH_TOKEN` environment variable.
     *
     * To create an auth token, follow this guide:
     * @see https://docs.sentry.io/product/accounts/auth-tokens/#organization-auth-tokens
     */
    authToken?: string;

    /**
     * The organization slug of your Sentry organization.
     * Instead of specifying this option, you can also set the `SENTRY_ORG` environment variable.
     */
    org?: string;

    /**
     * The project slug of your Sentry project.
     * Instead of specifying this option, you can also set the `SENTRY_PROJECT` environment variable.
     */
    project?: string;

    /**
     * If this flag is `true`, the Sentry plugin will collect some telemetry data and send it to Sentry.
     * It will not collect any sensitive or user-specific data.
     *
     * @default true
     */
    telemetry?: boolean;

    /**
     * A glob or an array of globs that specify the build artifacts and source maps that will be uploaded to Sentry.
     *
     * If this option is not specified, sensible defaults based on your `outDir`, `rootDir` and `adapter`
     * config will be used. Use this option to override these defaults, for instance if you have a
     * customized build setup that diverges from Nuxt's defaults.
     *
     * The globbing patterns must follow the implementation of the `glob` package.
     * @see https://www.npmjs.com/package/glob#glob-primer
     */
    assets?: string | Array<string>;
  };
};

/**
 * The SDK options are mostly handled inside the `init` function in separate files (see type `SentryNuxtOptions`).
 * Other options, such as the source maps options are added inside the `nuxt.config.ts` to be able to access those options during build time and modify the Vite config.
 */
export type SentryNuxtModuleOptions = Pick<Options, 'debug'> & SourceMapsOptions;
