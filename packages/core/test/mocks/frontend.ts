import { FrontendBase } from '../../src/lib/base';
import { Sdk } from '../../src/lib/sdk';
import { TestBackend, TestOptions } from './backend';

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

  public async captureException(exception: any): Promise<void> {
    await this.getBackend().sendEvent({
      message: String(exception),
    });
  }

  public async captureMessage(message: string): Promise<void> {
    await this.getBackend().sendEvent({ message });
  }
}

// tslint:disable-next-line:variable-name
export const TestClient = new Sdk(TestFrontend);
