import {expect} from 'chai';
import {Context} from '../src/lib/context';

describe('Context', () => {
  it('should be empty when initialized', () => {
    const context = new Context();
    expect(context.get()).to.deep.equal({});
  });

  it('should set provided data', () => {
    const context = new Context();
    context.set({
      tags: ['abc'],
      extra: {
        some: 'key',
      },
      user: {
        username: 'rick',
      },
    });
    expect(context.get()).to.deep.equal({
      tags: ['abc'],
      extra: {
        some: 'key',
      },
      user: {
        username: 'rick',
      },
    });
  });

  it('should override only provided keys and leave the rest', () => {
    const context = new Context();
    context.set({
      tags: ['abc'],
      extra: {
        some: 'key',
      },
    });
    context.set({
      tags: ['a', 'b', 'c'],
    });

    expect(context.get()).to.deep.equal({
      tags: ['a', 'b', 'c'],
      extra: {
        some: 'key',
      },
    });
  });

  it('should allow for overrides based on previous state by using callback function', () => {
    const context = new Context();
    context.set({
      tags: ['abc'],
      extra: {
        some: 'key',
      },
    });
    context.set(prevContext => ({
      tags: ((prevContext && prevContext.tags) || []).concat('xyz'),
    }));

    expect(context.get()).to.deep.equal({
      tags: ['abc', 'xyz'],
      extra: {
        some: 'key',
      },
    });
  });

  it('shouldnt mutate original context when assigned directly to retrieved object', () => {
    const context = new Context();
    context.set({
      extra: {
        some: 'key',
      },
    });

    const currentContext = context.get();
    Object.assign(currentContext, {
      more: 'keys',
    });

    expect(context.get()).to.deep.equal({
      extra: {
        some: 'key',
      },
    });
  });

  it('shouldnt mutate original context when modified in callback function', () => {
    const context = new Context();
    context.set({
      extra: {
        some: 'key',
      },
    });

    context.set(prevContext => {
      Object.assign(prevContext.extra, {
        more: 'keys',
      });

      return {
        tags: ['abc'],
      };
    });

    expect(context.get()).to.deep.equal({
      tags: ['abc'],
      extra: {
        some: 'key',
      },
    });
  });
});
