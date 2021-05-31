import { SDK_VERSION } from '@sentry/core';
import { Package, SdkInfo } from '@sentry/types';

import { MetadataBuilder, PACKAGE_NAME_PREFIX, SDK_NAME } from '../../src/utils/metadataBuilder';
import { NextjsOptions } from '../../src/utils/nextjsOptions';

describe('build metadata', () => {
  test('without packages', () => {
    const nextjsOptions: NextjsOptions = {};
    const metadataPackages: string[] = [];
    testMetadataBuilder(nextjsOptions, metadataPackages);
  });

  test('with packages', () => {
    const nextjsOptions: NextjsOptions = {};
    const metadataPackages: string[] = ['packageA', 'packageB'];
    testMetadataBuilder(nextjsOptions, metadataPackages);
  });
});

function testMetadataBuilder(nextjsOptions: NextjsOptions, packages: string[]): void {
  new MetadataBuilder(nextjsOptions, packages).addSdkMetadata();
  const optionsMetadata = nextjsOptions._metadata;
  expect(optionsMetadata).toBeDefined();
  const sdkInfo = optionsMetadata?.sdk;
  testSdkInfo(sdkInfo);
  testSdkInfoPackages(sdkInfo?.packages, packages);
}

function testSdkInfo(sdkInfo: SdkInfo | undefined): void {
  expect(sdkInfo).toBeDefined();
  expect(sdkInfo?.name).toBeDefined();
  expect(sdkInfo?.name).toEqual(SDK_NAME);
  expect(sdkInfo?.version).toEqual(expect.any(String));
  expect(sdkInfo?.packages).toEqual(expect.any(Array));
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
    return currentPkg.name.substring(PACKAGE_NAME_PREFIX.length);
  });
  expect(pkgNames).toEqual(expectedPkgNames);
}
