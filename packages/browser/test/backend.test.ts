import { expect } from 'chai';

import { BrowserBackend } from '../src/backend';

let backend: BrowserBackend;

describe('BrowserBackend', () => {
  describe('sendEvent()', () => {
    it('should use NoopTransport', async () => {
      backend = new BrowserBackend({});
      expect(backend.getTransport().constructor.name).to.equal('NoopTransport');
    });
  });
});
