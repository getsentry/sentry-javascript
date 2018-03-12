import { FrontendBase } from '../../src/lib/base';
import { SdkInfo } from '../../src/lib/domain';
import { Sdk } from '../../src/lib/sdk';
import { TestBackend, TestOptions } from './backend';

export const TEST_SDK = {
  name: 'sentry-test',
  version: '0.0.0-dev',
};

export class TestFrontend extends FrontendBase<TestBackend, TestOptions> {
  public static instance?: TestFrontend;

  public installed?: boolean;

  public constructor(options: TestOptions) {
    super(TestBackend, options);
    TestFrontend.instance = this;
    this.installed = false;
  }

  public async install(): Promise<boolean> {
    const result = await super.install();
    this.installed = true;
    return result;
  }

  public getSdkInfo(): SdkInfo {
    return TEST_SDK;
  }
}

// tslint:disable-next-line:variable-name
export const TestClient = new Sdk(TestFrontend);
