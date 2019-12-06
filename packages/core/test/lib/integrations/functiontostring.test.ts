import { fill } from '../../../../utils/src/object';
import { FunctionToString } from '../../../src/integrations/functiontostring';

describe('FunctionToString', () => {
  it('it works as expected', () => {
    const foo = {
      bar(wat: boolean): boolean {
        return wat;
      },
    };
    const originalFunction = foo.bar.toString();
    fill(foo, 'bar', function wat(whatever: boolean): () => void {
      return function watwat(): boolean {
        return whatever;
      };
    });

    expect(foo.bar.toString()).not.toBe(originalFunction);

    const fts = new FunctionToString();
    fts.setupOnce();

    expect(foo.bar.toString()).toBe(originalFunction);
  });
});
