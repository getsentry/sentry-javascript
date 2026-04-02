import { vi, beforeEach, describe, it, expect } from 'vitest';
import { setSDKProcessingMetadata } from '../../../../src/integrations/express/set-sdk-processing-metadata';

const sdkProcessingMetadatas: unknown[] = [];
beforeEach(() => (sdkProcessingMetadatas.length = 0));
const isolationScope = {
  _scopeData: {} as { sdkProcessingMetadata?: unknown },
  getScopeData() {
    return this._scopeData;
  },
  setSDKProcessingMetadata(data: unknown) {
    this._scopeData.sdkProcessingMetadata = data;
    sdkProcessingMetadatas.push(data);
  },
};
vi.mock('../../../../src/currentScopes', () => ({
  getIsolationScope() {
    return isolationScope;
  },
}));

describe('setSDKProcessingMetadata', () => {
  it('sets the normalized request data', () => {
    const request = {
      originalUrl: '/a/b/c',
      route: '/a/:boo/:car',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };
    setSDKProcessingMetadata(request);
    // call it again to cover no-op branch
    setSDKProcessingMetadata(request);
    expect(JSON.stringify(sdkProcessingMetadatas)).toBe(
      JSON.stringify([
        {
          normalizedRequest: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        },
      ]),
    );
  });
});
