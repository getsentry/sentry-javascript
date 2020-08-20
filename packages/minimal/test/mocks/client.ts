import { getCurrentHub } from '@sentry/hub';

export class TestClient {
  public static instance?: TestClient;

  public constructor(public options: Record<string, unknown>) {
    TestClient.instance = this;
  }

  public mySecretPublicMethod(str: string): string {
    return `secret: ${str}`;
  }
}

export class TestClient2 {}

export function init(options: Record<string, unknown>): void {
  getCurrentHub().bindClient(new TestClient(options) as any);
}
