import { SdkInfo } from '@sentry/shim';
import { FrontendBase } from '../../src/base';
import { createAndBind } from '../../src/sdk';
import { TestBackend, TestOptions } from './backend';

export const TEST_SDK = {
  name: 'sentry-test',
  version: '0.0.0-dev',
};

export class TestFrontend extends FrontendBase<TestBackend, TestOptions> {
  public static instance?: TestFrontend;

  public constructor(options: TestOptions) {
    super(TestBackend, options);
    TestFrontend.instance = this;
  }

  public getSdkInfo(): SdkInfo {
    return TEST_SDK;
  }
}

export function create(options: TestOptions): void {
  createAndBind(TestFrontend, options);
}
