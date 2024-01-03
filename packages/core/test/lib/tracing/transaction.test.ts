import { Transaction } from '../../../src';

describe('transaction', () => {
  it('works with name', () => {
    const transaction = new Transaction({ name: 'span name' });
    expect(transaction.name).toEqual('span name');
  });

  it('allows to update the name via setter', () => {
    const transaction = new Transaction({ name: 'span name' });
    transaction.setMetadata({ source: 'route' });
    expect(transaction.name).toEqual('span name');

    transaction.name = 'new name';

    expect(transaction.name).toEqual('new name');
    expect(transaction.metadata.source).toEqual('custom');
  });

  it('allows to update the name via setName', () => {
    const transaction = new Transaction({ name: 'span name' });
    transaction.setMetadata({ source: 'route' });
    expect(transaction.name).toEqual('span name');

    transaction.setMetadata({ source: 'route' });

    // eslint-disable-next-line deprecation/deprecation
    transaction.setName('new name');

    expect(transaction.name).toEqual('new name');
    expect(transaction.metadata.source).toEqual('custom');
  });

  it('allows to update the name via updateName', () => {
    const transaction = new Transaction({ name: 'span name' });
    transaction.setMetadata({ source: 'route' });
    expect(transaction.name).toEqual('span name');

    transaction.updateName('new name');

    expect(transaction.name).toEqual('new name');
    expect(transaction.metadata.source).toEqual('route');
  });
});
