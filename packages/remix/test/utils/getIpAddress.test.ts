import { getClientIPAddress } from '../../src/utils/vendor/getIpAddress';

class Headers {
  private _headers: Record<string, string> = {};

  get(key: string): string | null {
    return this._headers[key] ?? null;
  }

  set(key: string, value: string): void {
    this._headers[key] = value;
  }
}

describe('getClientIPAddress', () => {
  it.each([
    [
      '2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5,2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5, 141.101.69.35',
      '2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5',
    ],
    [
      '2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5,   2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5, 141.101.69.35',
      '2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5',
    ],
    [
      '2a01:cb19:8350:ed00:d0dd:INVALID_IP_ADDR:8be5,141.101.69.35,2a01:cb19:8350:ed00:d0dd:fa5b:de31:8be5',
      '141.101.69.35',
    ],
    [
      '2b01:cb19:8350:ed00:d0dd:fa5b:nope:8be5,   2b01:cb19:NOPE:ed00:d0dd:fa5b:de31:8be5,   141.101.69.35  ',
      '141.101.69.35',
    ],
    ['2b01:cb19:8350:ed00:d0 dd:fa5b:de31:8be5, 141.101.69.35', '141.101.69.35'],
  ])('should parse the IP from the X-Forwarded-For header %s', (headerValue, expectedIP) => {
    const headers = new Headers();
    headers.set('X-Forwarded-For', headerValue);

    const ip = getClientIPAddress(headers as any);

    expect(ip).toEqual(expectedIP);
  });
});
