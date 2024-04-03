import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, Transaction, spanToJSON } from '../../../src';

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
      expect(spanToJSON(transaction).data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('route');

      transaction.updateName('new name');

      expect(spanToJSON(transaction).description).toEqual('new name');
      expect(spanToJSON(transaction).data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toEqual('custom');
    });
    /* eslint-enable deprecation/deprecation */
  });
});
