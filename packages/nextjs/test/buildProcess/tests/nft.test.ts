/* eslint-disable @typescript-eslint/no-var-requires */

import { deepReadDirSync } from '@sentry/node';

type NFTFile = {
  files: string[];
};

it('excludes build-time SDK dependencies from nft files', () => {
  const dogNFTjson = require('../testApp/.next/server/pages/api/dogs.js.nft.json') as NFTFile;

  // These are all of the files which control the way we modify the user's app build by changing the webpack config.
  // They get mistakenly included by the nft plugin because we export `withSentryConfig` from `index.server.ts`. Because
  // the wrappers are referenced from the code we inject at build time, they need to stay.
  const sentryConfigDirEntries = dogNFTjson.files.filter(entry =>
    entry.includes('node_modules/@sentry/nextjs/build/cjs/config'),
  );
  const withSentryConfigEntries = sentryConfigDirEntries.filter(entry => !entry.includes('config/wrappers'));
  const sentryWrapperEntries = sentryConfigDirEntries.filter(entry => entry.includes('config/wrappers'));

  // Sucrase and rollup are dependencies of one of the webpack loaders we add to the config - also not needed at runtime.
  const sucraseEntries = dogNFTjson.files.filter(entry => entry.includes('node_modules/sucrase'));
  const rollupEntries = dogNFTjson.files.filter(
    entry => entry.includes('node_modules/rollup') || entry.includes('node_modules/@rollup'),
  );

  // None of the build-time dependencies should be listed
  expect(withSentryConfigEntries.length).toEqual(0);
  expect(sucraseEntries.length).toEqual(0);
  expect(rollupEntries.length).toEqual(0);

  // We don't want to accidentally remove the wrappers
  const wrapperFiles = deepReadDirSync('src/config/wrappers/').filter(filename => filename !== 'types.ts');
  expect(sentryWrapperEntries.length).toEqual(wrapperFiles.length);
});
