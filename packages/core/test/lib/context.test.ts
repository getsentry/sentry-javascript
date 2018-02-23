// tslint:disable
import { expect } from 'chai';
import ContextManager from '../../src/lib/context';

describe('Context', () => {
  it('should be empty when initialized', () => {
    const context = new ContextManager();
    expect(context.get()).to.deep.equal({});
  });

  it('should set provided data', () => {
    const context = new ContextManager();
    context.set({
      tags: { abc: 'def' },
      extra: { some: 'key' },
      user: { username: 'rick' },
    });
    expect(context.get()).to.deep.equal({
      tags: { abc: 'def' },
      extra: {
        some: 'key',
      },
      user: {
        username: 'rick',
      },
    });
  });

  it('should override only provided keys and leave the rest', () => {
    const context = new ContextManager();
    context.set({ tags: { abc: 'def' }, extra: { some: 'key' } });
    context.set({ tags: { a: 'b', c: 'd' } });

    expect(context.get()).to.deep.equal({
      tags: { a: 'b', c: 'd' },
      extra: { some: 'key' },
    });
  });

  it('should allow for overrides based on previous state by using callback function', () => {
    const context = new ContextManager();
    context.set({ tags: { abc: 'def' }, extra: { some: 'key' } });
    context.update(prevContext => ({
      tags: { ...(prevContext && prevContext.tags), uvw: 'xyz' },
    }));

    expect(context.get()).to.deep.equal({
      tags: { abc: 'def', uvw: 'xyz' },
      extra: { some: 'key' },
    });
  });

  it('shouldnt mutate original context when assigned directly to retrieved object', () => {
    const context = new ContextManager();
    context.set({
      extra: { some: 'key' },
    });

    const currentContext = context.get();
    Object.assign(currentContext, {
      more: 'keys',
    });

    expect(context.get()).to.deep.equal({
      extra: { some: 'key' },
    });
  });

  it('shouldnt mutate original context when modified in callback function', () => {
    const context = new ContextManager();
    context.set({
      extra: {
        some: 'key',
      },
    });

    context.update(prevContext => {
      Object.assign(prevContext.extra, {
        more: 'keys',
      });

      return { tags: { abc: 'def' } };
    });

    expect(context.get()).to.deep.equal({
      tags: { abc: 'def' },
      extra: {
        some: 'key',
      },
    });
  });
});
