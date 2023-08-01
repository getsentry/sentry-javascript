/**
 * Returns an environment setting value determined by Vercel's `VERCEL_ENV` environment variable.
 *
 * @param envVarPrefix Prefix to use for the VERCEL_ENV environment variable (e.g. NEXT_PUBLIC_).
 */
export function getVercelEnv(envVarPrefix?: string): string | undefined {
  const vercelEnvVar = process.env[`${envVarPrefix ? envVarPrefix : ''}VERCEL_ENV`];
  return vercelEnvVar ? `vercel-${vercelEnvVar}` : undefined;
}
