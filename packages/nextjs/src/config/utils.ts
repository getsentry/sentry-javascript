import * as fs from 'fs';
import * as path from 'path';

import { WebpackConfigObject } from './types';

export const SENTRY_CLIENT_CONFIG_FILE = './sentry.client.config.js';
export const SENTRY_SERVER_CONFIG_FILE = './sentry.server.config.js';
// this is where the transpiled/bundled version of `SENTRY_SERVER_CONFIG_FILE` will end up
export const SERVER_SDK_INIT_PATH = 'sentry/initServerSDK.js';

/**
 * Store the path to the bundled version of the user's server config file (where `Sentry.init` is called).
 *
 * @param config Incoming webpack configuration, passed to the `webpack` function we set in the nextjs config.
 */
export function storeServerConfigFileLocation(config: WebpackConfigObject): void {
  const outputLocation = path.dirname(path.join(config.output.path, config.output.filename));
  const serverSDKInitOutputPath = path.join(outputLocation, SERVER_SDK_INIT_PATH);
  const projectDir = config.context;
  setRuntimeEnvVars(projectDir, {
    // ex: .next/server/sentry/initServerSdk.js
    SENTRY_SERVER_INIT_PATH: path.relative(projectDir, serverSDKInitOutputPath),
  });
}

/**
 * Set variables to be added to the env at runtime, by storing them in `.env.local` (which `next` automatically reads
 * into memory at server startup).
 *
 * @param projectDir The path to the project root
 * @param vars Object containing vars to set
 */
export function setRuntimeEnvVars(projectDir: string, vars: { [key: string]: string }): void {
  // ensure the file exists
  const envFilePath = path.join(projectDir, '.env.local');
  if (!fs.existsSync(envFilePath)) {
    fs.writeFileSync(envFilePath, '');
  }

  let fileContents = fs
    .readFileSync(envFilePath)
    .toString()
    .trim();

  Object.entries(vars).forEach(entry => {
    const [varName, value] = entry;
    const envVarString = `${varName}=${value}`;

    // new entry
    if (!fileContents.includes(varName)) {
      fileContents = `${fileContents}\n${envVarString}`;
    }
    // existing entry; make sure value is up to date
    else {
      fileContents = fileContents.replace(new RegExp(`${varName}=\\S+`), envVarString);
    }
  });

  fs.writeFileSync(envFilePath, `${fileContents.trim()}\n`);
}
