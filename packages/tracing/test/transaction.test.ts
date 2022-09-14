import { Transaction } from '../src/transaction';

describe('`Transaction` class', () => {
  describe('transaction name source', () => {
    it('sets source in constructor if provided', () => {
      const transaction = new Transaction({ name: 'dogpark', metadata: { source: 'route' } });

      expect(transaction.name).toEqual('dogpark');
      expect(transaction.metadata.source).toEqual('route');
    });

    it("doesn't set source in constructor if not provided", () => {
      const transaction = new Transaction({ name: 'dogpark' });

      expect(transaction.name).toEqual('dogpark');
      expect(transaction.metadata.source).toBeUndefined();
    });

    it("sets source to `'custom'` when assigning to `name` property", () => {
      const transaction = new Transaction({ name: 'dogpark' });
      transaction.name = 'ballpit';

      expect(transaction.name).toEqual('ballpit');
      expect(transaction.metadata.source).toEqual('custom');
    });

    it('updates transaction name changes with correct variables needed', () => {
      const transaction = new Transaction({ name: 'dogpark', metadata: { source: 'url' } });
      expect(transaction.metadata.changes).toEqual([]);

      transaction.name = 'ballpit';

      expect(transaction.metadata.changes).toEqual([
        {
          source: 'url',
          timestamp: expect.any(Number),
          propagations: 0,
        },
      ]);

      transaction.metadata.propagations += 3;

      expect(transaction.metadata.changes).toEqual([
        {
          source: 'url',
          timestamp: expect.any(Number),
          propagations: 0,
        },
      ]);

      transaction.name = 'playground';

      expect(transaction.metadata.changes).toEqual([
        {
          source: 'url',
          timestamp: expect.any(Number),
          propagations: 0,
        },
        {
          source: 'custom',
          timestamp: expect.any(Number),
          propagations: 3,
        },
      ]);

      // Only change `source`
      transaction.setName('playground', 'route');

      expect(transaction.metadata.changes).toEqual([
        {
          source: 'url',
          timestamp: expect.any(Number),
          propagations: 0,
        },
        {
          source: 'custom',
          timestamp: expect.any(Number),
          propagations: 3,
        },
        {
          source: 'custom',
          timestamp: expect.any(Number),
          propagations: 3,
        },
      ]);
    });

    it("doesn't update transaction name changes if no change in data", () => {
      const transaction = new Transaction({ name: 'dogpark' });
      expect(transaction.metadata.changes).toEqual([]);

      transaction.name = 'ballpit';

      expect(transaction.metadata.changes).toEqual([
        {
          source: 'custom',
          timestamp: expect.any(Number),
          propagations: 0,
        },
      ]);

      transaction.name = 'ballpit';

      // Still only one entry
      expect(transaction.metadata.changes).toEqual([
        {
          source: 'custom',
          timestamp: expect.any(Number),
          propagations: 0,
        },
      ]);

      transaction.setName('ballpit', 'custom');

      // Still only one entry
      expect(transaction.metadata.changes).toEqual([
        {
          source: 'custom',
          timestamp: expect.any(Number),
          propagations: 0,
        },
      ]);
    });

    describe('`setName` method', () => {
      it("sets source to `'custom'` if no source provided", () => {
        const transaction = new Transaction({ name: 'dogpark' });
        transaction.setName('ballpit');

        expect(transaction.name).toEqual('ballpit');
        expect(transaction.metadata.source).toEqual('custom');
      });

      it('uses given `source` value', () => {
        const transaction = new Transaction({ name: 'dogpark' });
        transaction.setName('ballpit', 'route');

        expect(transaction.name).toEqual('ballpit');
        expect(transaction.metadata.source).toEqual('route');
      });

      it('updates transaction name changes with correct variables needed', () => {
        const transaction = new Transaction({ name: 'dogpark', metadata: { source: 'url' } });
        expect(transaction.metadata.changes).toEqual([]);

        transaction.name = 'ballpit';

        expect(transaction.metadata.changes).toEqual([
          {
            source: 'url',
            timestamp: expect.any(Number),
            propagations: 0,
          },
        ]);

        transaction.metadata.propagations += 3;

        expect(transaction.metadata.changes).toEqual([
          {
            source: 'url',
            timestamp: expect.any(Number),
            propagations: 0,
          },
        ]);

        transaction.setName('playground', 'task');

        expect(transaction.metadata.changes).toEqual([
          {
            source: 'url',
            timestamp: expect.any(Number),
            propagations: 0,
          },
          {
            source: 'custom',
            timestamp: expect.any(Number),
            propagations: 3,
          },
        ]);
      });
    });
  });
});
