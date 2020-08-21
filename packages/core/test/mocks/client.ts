import { BaseClient } from '../../src/baseclient';
import { initAndBind } from '../../src/sdk';
import { TestBackend, TestOptions } from './backend';

export class TestClient extends BaseClient<TestBackend, TestOptions> {
  public static instance?: TestClient;

  public constructor(options: TestOptions) {
    super(TestBackend, options);
    TestClient.instance = this;
  }
}

export function init(options: TestOptions): void {
  initAndBind(TestClient, options);
}
