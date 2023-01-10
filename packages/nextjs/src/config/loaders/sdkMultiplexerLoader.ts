import { LoaderThis } from './types';

type LoaderOptions = {
  importTarget: string;
};

/**
 * TODO
 */
export default function sdkMultiplexerLoader(this: LoaderThis<LoaderOptions>, userCode: string): string {
  if (!userCode.match(/__SENTRY_FAILSAFE_STRING__/)) {
    return userCode;
  }

  // We know one or the other will be defined, depending on the version of webpack being used
  const { importTarget } = 'getOptions' in this ? this.getOptions() : this.query;

  return `export * from "${importTarget}"`;
}
