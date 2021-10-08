import { SDK_VERSION } from '@sentry/react';

import { MetadataBuilder, PACKAGE_NAME_PREFIX, SDK_NAME } from '../../src/utils/metadataBuilder';
import { GatsbyOptions } from '../../src/utils/types';

describe('build sdk metadata', () => {
  test.each([
    ['without packages', []],
    ['with packages', ['pkgA', 'pkgB']],
  ])('%s', (_testName, packages: string[]) => {
    const options: GatsbyOptions = {};
    new MetadataBuilder(options, packages).addSdkMetadata();

    const sdkInfo = options._metadata?.sdk;
    expect(sdkInfo?.name).toEqual(SDK_NAME);
    expect(sdkInfo?.version).toBe(SDK_VERSION);

    expect(Array.isArray(sdkInfo?.packages)).toBe(true);
    expect(sdkInfo?.packages).toHaveLength(packages.length);
    sdkInfo?.packages?.map((pkg, idx) => {
      expect(pkg.name).toStrictEqual(`${PACKAGE_NAME_PREFIX}${packages[idx]}`);
      expect(pkg.version).toBe(SDK_VERSION);
    });
  });
});
