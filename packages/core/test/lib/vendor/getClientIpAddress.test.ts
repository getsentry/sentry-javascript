import { describe, expect, it } from 'vitest';
import { getClientIPAddress } from '../../../src/vendor/getIpAddress';

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
    const headers = {
      'X-Forwarded-For': headerValue,
    };

    const ip = getClientIPAddress(headers);

    expect(ip).toEqual(expectedIP);
  });

  it('should find headers regardless of case', () => {
    const headers = {
      'Cf-Connecting-Ip': '1.1.1.1',
    };

    const ip = getClientIPAddress(headers);
    expect(ip).toEqual('1.1.1.1');
  });
});
