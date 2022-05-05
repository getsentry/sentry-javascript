// we need some import or export to exist, to satisfy the tsconfig --isolatedModules setting
import { dummyExport } from '../src';

describe('placeholder tests', () => {
  it('holds a place', () => {
    expect(dummyExport).toEqual({});
  });
});
