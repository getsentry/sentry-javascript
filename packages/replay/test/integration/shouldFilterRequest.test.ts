import { shouldFilterRequest } from '../../src/util/shouldFilterRequest';
import { mockSdk } from '../index';

describe('Integration | shouldFilterRequest', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should not filter requests from non-Sentry ingest URLs', async () => {
    const { replay } = await mockSdk();

    expect(shouldFilterRequest(replay, 'https://example.com/foo')).toBe(false);
  });

  it('should filter requests for Sentry ingest URLs', async () => {
    const { replay } = await mockSdk();

    expect(shouldFilterRequest(replay, 'https://03031aa.ingest.f00.f00/api/129312/')).toBe(true);
  });
});
