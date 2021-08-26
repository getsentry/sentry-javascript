import { Queue } from '../src/queue';

describe('Queue', () => {
  test('Return first item from the queue', () => {
    const queue = new Queue<number>(2);
    queue.enqueue(42);
    queue.enqueue(1337);
    expect(queue.dequeue()).toEqual(42);
  });

  test('Returns undefined if there are no items in the queue', () => {
    const queue = new Queue<number>(2);
    expect(queue.dequeue()).toEqual(undefined);
  });

  test('Removes dequeued items from the queue', () => {
    const queue = new Queue<number>(2);
    queue.enqueue(42);
    queue.enqueue(1337);
    expect(queue.dequeue()).toEqual(42);
    expect(queue.dequeue()).toEqual(1337);
    expect(queue.dequeue()).toEqual(undefined);
  });

  test('Throws error when trying to add item to the full queue', () => {
    const queue = new Queue<number>(2);
    queue.enqueue(42);
    queue.enqueue(1337);
    expect(() => queue.enqueue(777)).toThrowError(new RangeError('Queue is full'));
  });
});
