import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { getProjects } from './utils';

export type UploadCredentials = {
  authToken?: string;
  org?: string;
  project?: string | string[];
};

/** The variables in `.env.sentry-build-plugin`, or `undefined` when the file does not exist. */
export function readSentryBuildPluginEnvFile(): Record<string, string> | undefined {
  try {
    const dotenvFile = fs.readFileSync(path.join(process.cwd(), '.env.sentry-build-plugin'), 'utf-8');
    // NOTE: Do not use the dotenv.config API directly to read the dotenv file! For some ungodly reason, it falls back to reading `${process.cwd()}/.env` which is absolutely not what we want.
    return dotenv.parse(dotenvFile);
  } catch (e: unknown) {
    // Ignore "file not found" errors but throw all others
    if (typeof e === 'object' && e && 'code' in e && e.code !== 'ENOENT') {
      throw e;
    }
    return undefined;
  }
}

/** Reads `SENTRY_PROJECT`, which holds one project or a comma-separated list. */
export function parseProjectEnvVar(value: string | undefined): string | string[] | undefined {
  return value?.includes(',') ? value.split(',').map(p => p.trim()) : value;
}

/** The first credential the upload needs that is missing. */
export function getMissingUploadCredential({
  authToken,
  org,
  project,
}: UploadCredentials): 'no-auth-token' | 'no-org' | 'no-project' | undefined {
  if (!authToken) {
    return 'no-auth-token';
  }
  if (!org && !authToken.startsWith('sntrys_')) {
    return 'no-org';
  }
  if (!getProjects(project)?.[0]) {
    return 'no-project';
  }
  return undefined;
}

/**
 * Whether the plugin has the credentials to upload source maps. It reads the same environment
 * variables and `.env.sentry-build-plugin` file as the plugin, so SDKs can call it before they
 * create the plugin.
 */
export function hasSourceMapUploadCredentials(options: UploadCredentials | undefined): boolean {
  const envFile = readSentryBuildPluginEnvFile();
  const env = (name: string): string | undefined => envFile?.[name] ?? process.env[name];

  return (
    getMissingUploadCredential({
      authToken: options?.authToken ?? env('SENTRY_AUTH_TOKEN'),
      org: options?.org ?? env('SENTRY_ORG'),
      project: options?.project ?? parseProjectEnvVar(env('SENTRY_PROJECT')),
    }) === undefined
  );
}
