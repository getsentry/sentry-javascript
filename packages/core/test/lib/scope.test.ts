import { Scope } from '../../src/scope';

describe('Scope', () => {
  test('breadcrumbs', () => {
    const scope = new Scope();
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect(scope.getBreadcrumbs()).toEqual([{ message: 'test' }]);
  });
});
