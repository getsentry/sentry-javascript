import { SdkInfo } from '@sentry/shim';
import { ClientBase } from '../../src/base';
import { initAndBind } from '../../src/sdk';
import { TestBackend, TestOptions } from './backend';

export const TEST_SDK = {
  name: 'sentry-test',
  version: '0.0.0-dev',
};

export class TestClient extends ClientBase<TestBackend, TestOptions> {
  public static instance?: TestClient;

  public constructor(options: TestOptions) {
    super(TestBackend, options);
    TestClient.instance = this;
  }

  public getSdkInfo(): SdkInfo {
    return TEST_SDK;
  }
}

export function init(options: TestOptions): void {
  initAndBind(TestClient, options);
}
