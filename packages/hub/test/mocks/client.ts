import { Client } from '@sentry/types';

export class TestClient implements Client {
  public setupIntegrations: jest.Mock = jest.fn();

  public captureException(): undefined {
    return;
  }

  public captureMessage(): undefined {
    return;
  }

  public captureEvent(): undefined {
    return;
  }

  public captureSession(): void {
    // no-empty
  }

  public getDsn(): undefined {
    return;
  }

  public getOptions(): Record<string, string> {
    return {};
  }

  public flush(): PromiseLike<boolean> {
    return Promise.resolve(true);
  }

  public close(): PromiseLike<boolean> {
    return Promise.resolve(true);
  }

  public getIntegration(): null {
    return null;
  }
}
