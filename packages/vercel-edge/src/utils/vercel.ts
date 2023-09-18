declare const process: {
  env: Record<string, string>;
};

/**
 * Returns an environment setting value determined by Vercel's `VERCEL_ENV` environment variable.
 *
 * @param isClient Flag to indicate whether to use the `NEXT_PUBLIC_` prefixed version of the environment variable.
 */
export function getVercelEnv(isClient: boolean): string | undefined {
  const vercelEnvVar = isClient ? process.env.NEXT_PUBLIC_VERCEL_ENV : process.env.VERCEL_ENV;
  return vercelEnvVar ? `vercel-${vercelEnvVar}` : undefined;
}
