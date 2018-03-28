import { createAndBind, FrontendBase, SdkInfo } from '@sentry/core';
import { TestBackend, TestOptions } from './backend';
export {
  captureException,
  captureMessage,
  setExtraContext,
  setTagsContext,
} from '../../src/index';
export { addBreadcrumb, setUserContext } from '@sentry/core';

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

  public install(): boolean {
    const result = super.install();
    this.installed = true;
    return result;
  }

  public getSdkInfo(): SdkInfo {
    return TEST_SDK;
  }
}

export function create(options: TestOptions): void {
  createAndBind(TestFrontend, options);
}
