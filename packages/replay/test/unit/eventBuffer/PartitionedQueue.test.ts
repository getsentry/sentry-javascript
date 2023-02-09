import { PartitionedQueue } from '../../../src/eventBuffer/PartitionedQueue';

describe('Unit | eventBuffer | PartitionedQueue', () => {
  it('works with empty queue', () => {
    const queue = new PartitionedQueue<string>();

    expect(queue.getItems()).toEqual([]);
    expect(queue.getLength()).toEqual(0);

    queue.clear();

    expect(queue.getItems()).toEqual([]);
    expect(queue.getLength()).toEqual(0);

    queue.clear(true);

    expect(queue.getItems()).toEqual([]);
    expect(queue.getLength()).toEqual(0);
  });

  it('allows to add records', () => {
    const queue = new PartitionedQueue<string>();

    queue.add('one');
    queue.add('two');
    queue.add('three');

    expect(queue.getItems()).toEqual(['one', 'two', 'three']);
    expect(queue.getLength()).toEqual(3);

    queue.clear();

    expect(queue.getItems()).toEqual([]);
    expect(queue.getLength()).toEqual(0);
  });

  it('allows to add records with checkouts', () => {
    const queue = new PartitionedQueue<string>();

    queue.add('one');
    queue.add('two');
    queue.add('three', true);
    queue.add('four');

    expect(queue.getItems()).toEqual(['one', 'two', 'three', 'four']);
    expect(queue.getLength()).toEqual(4);

    queue.clear(true);

    expect(queue.getItems()).toEqual(['three', 'four']);
    expect(queue.getLength()).toEqual(2);

    queue.clear(true);

    expect(queue.getItems()).toEqual(['three', 'four']);
    expect(queue.getLength()).toEqual(2);
  });
});
