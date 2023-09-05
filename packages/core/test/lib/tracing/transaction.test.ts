import { Transaction } from '../../../src';

describe('transaction', () => {
  it('works with name', () => {
    const transaction = new Transaction({ name: 'span name' });
    expect(transaction.name).toEqual('span name');
  });

  it('allows to update the name', () => {
    const transaction = new Transaction({ name: 'span name' });
    expect(transaction.name).toEqual('span name');

    transaction.name = 'new name';

    expect(transaction.name).toEqual('new name');
  });
});
