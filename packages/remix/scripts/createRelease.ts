import SentryCliModule from '@sentry/cli';
// Note: ESM import of '@sentry/cli' causes a:
//   `TypeError: SentryCli.default is not a constructor`
// When the script is used.
// Probably because the TS types and the actual module mixes up.
// This is a workaround for that.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SentryCli = require('@sentry/cli') as typeof SentryCliModule;
const sentry = new SentryCli();

export async function createRelease(
  argv: { release?: string; urlPrefix?: string; buildPath?: string },
  DEFAULT_URL_PREFIX: string,
  DEFAULT_BUILD_PATH: string,
): Promise<void> {
  const RELEASE = argv.release || (await sentry.releases.proposeVersion());
  const URL_PREFIX = argv.urlPrefix || DEFAULT_URL_PREFIX;
  const BUILD_PATH = argv.buildPath || DEFAULT_BUILD_PATH;

  await sentry.releases.new(RELEASE);

  await sentry.releases.uploadSourceMaps(RELEASE, {
    urlPrefix: URL_PREFIX,
    include: [BUILD_PATH],
  });

  await sentry.releases.finalize(RELEASE);
}
