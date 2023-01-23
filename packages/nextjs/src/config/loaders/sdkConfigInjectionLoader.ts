import MagicString from 'magic-string';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map';

import type { LoaderThis } from './types';

type LoaderOptions = {
  absoluteSdkConfigPath: string;
  server: boolean;
};

/**
 * TODO
 */
export default function (
  this: LoaderThis<LoaderOptions>,
  userCode: string | null,
  userModuleSourceMap: any,
): string | null | void {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { absoluteSdkConfigPath, server } = 'getOptions' in this ? this.getOptions() : this.query;

  if (!userCode) {
    return userCode;
  }

  this.async();

  console.log(server, this.resourcePath);

  const ms = new MagicString(userCode, { filename: this.resourcePath });
  ms.append(`;import "${absoluteSdkConfigPath}";`);
  const newCode = ms.toString();
  const newMap = ms.generateMap({
    includeContent: true,
    hires: true,
    source: this.resourcePath,
  });

  if (!userModuleSourceMap) {
    return this.callback(null, newCode, newMap as any);
  } else {
    const sm1Promise = new SourceMapConsumer(userModuleSourceMap);
    const sm2Promise = new SourceMapConsumer(
      ms.generateMap({ includeContent: true, hires: true, source: this.resourcePath }),
    );

    void Promise.all([sm1Promise, sm2Promise])
      .then(([sm1, sm2]) => {
        const smg = SourceMapGenerator.fromSourceMap(sm2);
        smg.applySourceMap(sm1, this.resourcePath);
        this.callback(null, newCode, smg.toJSON() as any);
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.warn(`[@sentry/nextjs] Wasn't able to merge source maps for "${this.resourcePath}".`, err);
        this.callback(null, newCode);
      });
  }
}
