/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { getWorkerURL } from '../../src';

describe('getWorkerURL', () => {
  // Safari (esp. iOS) rejects executing a Blob worker without a JavaScript MIME
  // type, firing a bare `error` event. The Blob must be tagged `text/javascript`
  // so the worker loads across browsers.
  it('creates the worker Blob with a JavaScript MIME type', () => {
    // jsdom does not implement `URL.createObjectURL`, so stub it and capture the Blob.
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:mock');
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;

    const url = getWorkerURL();

    expect(url).toBe('blob:mock');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/javascript');
  });
});
