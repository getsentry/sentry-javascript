import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  Transaction,
  spanToJSON,
} from '../../../src';

describe('transaction', () => {
  describe('name', () => {
    /* eslint-disable deprecation/deprecation */
    it('works with name', () => {
      const transaction = new Transaction({ name: 'span name' });
      expect(spanToJSON(transaction).description).toEqual('span name');
    });

    it('allows to update the name via updateName', () => {
      const transaction = new Transaction({ name: 'span name' });
      transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      expect(spanToJSON(transaction).description).toEqual('span name');

      transaction.updateName('new name');

      expect(spanToJSON(transaction).description).toEqual('new name');
      expect(transaction.metadata.source).toEqual('route');
    });
    /* eslint-enable deprecation/deprecation */
  });

  describe('metadata', () => {
    /* eslint-disable deprecation/deprecation */
    it('works with defaults', () => {
      const transaction = new Transaction({ name: 'span name' });
      expect(transaction.metadata).toEqual({
        spanMetadata: {},
      });
    });

    it('allows to set metadata in constructor', () => {
      const transaction = new Transaction({ name: 'span name', metadata: { request: {} } });
      expect(transaction.metadata).toEqual({
        spanMetadata: {},
        request: {},
      });
    });

    it('allows to set source & sample rate data in constructor', () => {
      const transaction = new Transaction({
        name: 'span name',
        metadata: { request: {} },
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 0.5,
        },
      });

      expect(transaction.metadata).toEqual({
        sampleRate: 0.5,
        spanMetadata: {},
        request: {},
      });

      expect(transaction.attributes).toEqual({
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 0.5,
      });
    });

    it('allows to update metadata via setMetadata', () => {
      const transaction = new Transaction({ name: 'span name', metadata: {} });

      transaction.setMetadata({ request: {} });

      expect(transaction.metadata).toEqual({
        spanMetadata: {},
        request: {},
      });
    });

    /* eslint-enable deprecation/deprecation */
  });
});
