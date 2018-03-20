// tslint:disable-next-line:no-submodule-imports
import { forget } from '@sentry/utils/dist/lib/async';
import { FrontendBase } from '../../src/lib/base';
import { Breadcrumb, SdkInfo, User } from '../../src/lib/domain';
import { TestBackend, TestOptions } from './backend';

import {
  addBreadcrumb as shimAddBreadcrumb,
  bindClient,
  getCurrentClient,
  setUserContext as shimSetUserContext,
} from '@sentry/shim';
export {
  captureException,
  captureMessage,
  setExtraContext,
  setTagsContext,
} from '@sentry/shim';

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

export function create(options: TestOptions): void {
  if (!getCurrentClient()) {
    const client = new TestFrontend(options);
    forget(client.install());
    bindClient(client);
  }
}

export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  shimAddBreadcrumb(breadcrumb);
}

export function setUserContext(user: User): void {
  shimSetUserContext(user);
}
