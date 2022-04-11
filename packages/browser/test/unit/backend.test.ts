import { BrowserBackend } from '../../src/backend';

let backend: BrowserBackend;

// TODO(v7): remove when deleting Backend

describe('BrowserBackend', () => {
  describe('sendEvent()', () => {
    it('should use NoopTransport', () => {
      backend = new BrowserBackend({});
      expect(backend.getTransport().constructor.name).toBe('NoopTransport');
    });
  });
});
