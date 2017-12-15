/// <reference types="jest" />
import { MockAdapter } from '../__mocks__/MockAdapter';
import * as Sentry from '../index';

const dsn = 'https://username:password@domain/path';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Sentry.Client context', () => {
  test('set tags', async () => {
    expect.assertions(2);
    const sentry = new Sentry.Client('https://username:password@domain/path');
    const adapter = await sentry.use(MockAdapter).install();
    const spy1 = jest.spyOn(adapter, 'setTagsContext');
    await sentry.setTagsContext({ yo: 12 });
    expect(sentry.getContext()).toEqual({ tags: { yo: 12 } });
    expect(spy1).toHaveBeenCalledTimes(1);
  });

  test('set extra and tags', async () => {
    expect.assertions(3);
    const sentry = new Sentry.Client('https://username:password@domain/path');
    const adapter = await sentry.use(MockAdapter).install();
    const spy1 = jest.spyOn(adapter, 'setExtraContext');
    await sentry.setTagsContext({ yo: 12 });
    expect(sentry.getContext()).toEqual({ tags: { yo: 12 } });
    await sentry.setExtraContext({ foo: 13 });
    expect(sentry.getContext()).toEqual({ tags: { yo: 12 }, extra: { foo: 13 } });
    expect(spy1).toHaveBeenCalledTimes(1);
  });

  test('clear context', async () => {
    expect.assertions(3);
    const sentry = new Sentry.Client('https://username:password@domain/path');
    const adapter = await sentry.use(MockAdapter).install();
    const spy1 = jest.spyOn(adapter, 'clearContext');
    await sentry.setTagsContext({ yo: 12 });
    expect(sentry.getContext()).toEqual({ tags: { yo: 12 } });
    await sentry.clearContext();
    expect(sentry.getContext()).toEqual({});
    expect(spy1).toHaveBeenCalledTimes(1);
  });

  test('set undefined', async () => {
    expect.assertions(5);
    const sentry = new Sentry.Client('https://username:password@domain/path');
    const adapter = await sentry.use(MockAdapter).install();
    await sentry.setTagsContext(undefined);
    expect(sentry.getContext()).toEqual({});
    await sentry.setTagsContext({ yo: 12 });
    expect(sentry.getContext()).toEqual({ tags: { yo: 12 } });
    await sentry.setTagsContext(undefined);
    expect(sentry.getContext()).toEqual({});
    await sentry.setExtraContext(undefined);
    expect(sentry.getContext()).toEqual({});
    await sentry.clearContext();
    expect(sentry.getContext()).toEqual({});
  });

  test('set user', async () => {
    expect.assertions(2);
    const sentry = new Sentry.Client('https://username:password@domain/path');
    const adapter = await sentry.use(MockAdapter).install();
    await sentry.setUserContext({
      id: 'test',
    });
    expect(sentry.getContext()).toEqual({ user: { id: 'test' } });
    await sentry.clearContext();
    expect(sentry.getContext()).toEqual({});
  });
});
