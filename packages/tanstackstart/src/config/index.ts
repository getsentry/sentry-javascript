/**
 * Wraps a TanStack Start config.
 */
export function wrapVinxiConfigWithSentry<C>(
  config: C,
  // TODO: Expand this type in the future. Right now it is just so that TS doesn't complain for our users when they copy paste from the docs.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sentryBuildOptions: {
    org?: string;
    project?: string;
    silent?: boolean;
  } = {},
): C {
  return config;
}
