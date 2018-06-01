import { bindClient, Scope } from '../../src';

export class ScopeMock implements Scope {
  public constructor(
    private user: any = {},
    private readonly tags: { [key: string]: string } = {},
    private readonly extra: { [key: string]: any } = {},
    private fingerprint?: string[],
  ) {}

  public setUser(user: any): void {
    this.user = user;
  }

  public setTag(key: string, value: string): void {
    this.tags[key] = value;
  }

  public setExtra(key: string, extra: any): void {
    this.extra = {
      ...this.extra,
      [key]: extra,
    };
  }

  public setFingerprint(fingerprint: string[]): void {
    this.fingerprint = fingerprint;
  }

  public clear(): void {
    this.user = undefined;
    this.extra = {};
    this.fingerprint = undefined;
  }
}

export class TestClient {
  public static instance?: TestClient;

  public constructor(public options: object) {
    TestClient.instance = this;
  }

  public mySecretPublicMethod(str: string): string {
    return `secret: ${str}`;
  }

  public createScope(): ScopeMock {
    return new ScopeMock();
  }
}

export class TestClient2 {}

export function init(options: object): void {
  bindClient(new TestClient(options));
}
