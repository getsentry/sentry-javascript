import { removeQueryParams } from '../../src/performance/client';

// [in, out]
type Table = Array<{ in: string; out: string }>;

describe('client', () => {
  describe('removeQueryParams', () => {
    it('removes query params from an url', () => {
      const table: Table = [
        { in: '/posts/[id]/[comment]?name=ferret&color=purple', out: '/posts/[id]/[comment]' },
        { in: '/posts/[id]/[comment]?', out: '/posts/[id]/[comment]' },
        { in: '/about?', out: '/about' },
      ];

      table.forEach(test => {
        expect(removeQueryParams(test.in)).toEqual(test.out);
      });
    });
  });
});
