import type { LoaderThis } from './types';

type LoaderOptions = {
  importTarget: string;
};

/**
 * This loader allows us to multiplex SDKs depending on what is passed to the `importTarget` loader option.
 * If this loader encounters a file that contains the string "__SENTRY_SDK_MULTIPLEXER__" it will replace it's entire
 * content with an "export all"-statement that points to `importTarget`.
 *
 * In our case we use this to multiplex different SDKs depending on whether we're bundling browser code, server code,
 * or edge-runtime code.
 */
export default function sdkMultiplexerLoader(this: LoaderThis<LoaderOptions>, userCode: string): string {
  if (!userCode.includes('_SENTRY_SDK_MULTIPLEXER')) {
    return userCode;
  }

  // We know one or the other will be defined, depending on the version of webpack being used
  const { importTarget } = 'getOptions' in this ? this.getOptions() : this.query;

  return `export * from "${importTarget}";`;
}
