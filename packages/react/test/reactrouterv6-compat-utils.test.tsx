import { getNumberOfUrlSegments } from '../src/reactrouterv6-compat-utils';

describe('getNumberOfUrlSegments', () => {
  test.each([
    ['regular path', '/projects/123/views/234', 4],
    ['single param parameterized path', '/users/:id/details', 3],
    ['multi param parameterized path', '/stores/:storeId/products/:productId', 4],
    ['regex path', String(/\/api\/post[0-9]/), 2],
  ])('%s', (_: string, input, output) => {
    expect(getNumberOfUrlSegments(input)).toEqual(output);
  });
});
