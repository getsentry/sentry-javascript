import { bindClient } from '../../src';

export class TestClient {
  public constructor(public options: object) {}

  public mySecretPublicMethod(str: string): string {
    return `secret: ${str}`;
  }
}

export class TestClient2 {}

export function create(options: object): void {
  bindClient(new TestClient(options));
}
