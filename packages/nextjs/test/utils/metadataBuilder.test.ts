import { SDK_VERSION } from '@sentry/core';
import { Package, SdkInfo } from '@sentry/types';

import { MetadataBuilder, PACKAGE_NAME_PREFIX, SDK_NAME } from '../../src/utils/metadataBuilder';
import { NextjsOptions } from '../../src/utils/nextjsOptions';

describe('build metadata', () => {
  test('without packages', () => {
    const nextjsOptions: NextjsOptions = {};
    const metadataPackages: string[] = [];
    new MetadataBuilder(nextjsOptions, metadataPackages).addSdkMetadata();

    const optionsMetadata = nextjsOptions._metadata;
    expect(optionsMetadata).toBeDefined();
    const sdkInfo = optionsMetadata?.sdk;
    testSdkInfo(sdkInfo);
    testSdkInfoPackages(sdkInfo?.packages, metadataPackages);
  });

  test('with packages', () => {
    const nextjsOptions: NextjsOptions = {};
    const metadataPackages: string[] = ['packageA', 'packageB'];
    new MetadataBuilder(nextjsOptions, metadataPackages).addSdkMetadata();

    const optionsMetadata = nextjsOptions._metadata;
    expect(optionsMetadata).toBeDefined();
    const sdkInfo = optionsMetadata?.sdk;
    testSdkInfo(sdkInfo);
    testSdkInfoPackages(sdkInfo?.packages, metadataPackages);
  });
});

function testSdkInfo(sdkInfo: SdkInfo | undefined): void {
  expect(sdkInfo).toBeDefined();
  expect(sdkInfo?.name).toBeDefined();
  expect(sdkInfo?.name).toEqual(SDK_NAME);
  expect(sdkInfo?.version).toBeDefined();
  expect(sdkInfo?.packages).toBeDefined();
}

function testSdkInfoPackages(actualPkgs: Package[] | undefined, expectedPkgNames: string[]): void {
  expect(actualPkgs).toBeDefined();
  expect(actualPkgs).toHaveLength(expectedPkgNames.length);

  const pkgNames = actualPkgs?.map((currentPkg: Package) => {
    expect(currentPkg.version).toBeDefined();
    expect(currentPkg.version).toEqual(SDK_VERSION);

    expect(currentPkg.name).toBeDefined();
    const pkgPrefix = currentPkg.name.substring(0, PACKAGE_NAME_PREFIX.length);
    expect(pkgPrefix).toEqual(PACKAGE_NAME_PREFIX);
    const packageName = currentPkg.name.substring(PACKAGE_NAME_PREFIX.length);
    return packageName;
  });
  expect(pkgNames).toEqual(expectedPkgNames);
}
