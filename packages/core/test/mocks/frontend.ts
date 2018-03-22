import { FrontendBase } from '../../src/lib/base';
import { SdkInfo } from '../../src/lib/domain';
import { createAndBind } from '../../src/lib/sdk';
import { TestBackend, TestOptions } from './backend';
export {
  captureException,
  captureMessage,
  setExtraContext,
  setTagsContext,
} from '@sentry/shim';
export { addBreadcrumb, setUserContext } from '../../src/lib/sdk';

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
