import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deriveOrgIdFromClient } from '../../../src/tracing/utils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('deriveOrgIdFromClient', () => {
  let client: TestClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns orgId from client options when available', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        orgId: '00222111',
        dsn: 'https://public@sentry.example.com/1',
      }),
    );

    const result = deriveOrgIdFromClient(client);
    expect(result).toBe('00222111');
  });

  test('converts non-string orgId to string', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        orgId: 12345,
        dsn: 'https://public@sentry.example.com/1',
      }),
    );

    const result = deriveOrgIdFromClient(client);
    expect(result).toBe('12345');
  });

  test('extracts orgId from DSN host when options.orgId is not available', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@o012300.example.com/1',
      }),
    );

    const result = deriveOrgIdFromClient(client);
    expect(result).toBe('012300');
  });

  test('returns undefined when neither options.orgId nor DSN host are available', () => {
    client = new TestClient(getDefaultTestClientOptions({}));

    const result = deriveOrgIdFromClient(client);
    expect(result).toBeUndefined();
  });
});
