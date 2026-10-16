import { describe, expect, test, vi } from 'vitest';
import { createHeadTagInjector } from '../../src/server/headTagInjector';

const TAG = '<meta name="sentry-trace" content="x">';
const HEAD = '</head>';

function makeInjector() {
  const getTags = vi.fn(() => TAG);
  return { getTags, injector: createHeadTagInjector(getTags) };
}

describe('createHeadTagInjector', () => {
  test('injects when the tag is fully inside one chunk', () => {
    const { injector, getTags } = makeInjector();
    const out = injector.push('<html><head></head><body>x</body></html>');
    expect(out).toBe(`<html><head>${TAG}</head><body>x</body></html>`);
    expect(getTags).toHaveBeenCalledTimes(1);
  });

  test.each([1, 2, 3, 4, 5])('injects when </head> is split at offset %i across two pushes', offset => {
    const { injector } = makeInjector();
    const first = `<head>${HEAD.slice(0, offset)}`;
    const second = `${HEAD.slice(offset)}<body></body>`;
    const out = injector.push(first) + injector.push(second) + injector.flush();
    expect(out).toBe(`<head>${TAG}${HEAD}<body></body>`);
  });

  test('holds back a partial tag and does not emit it early', () => {
    const { injector } = makeInjector();
    expect(injector.push('<head></he')).toBe('<head>');
    expect(injector.push('ad><body>')).toBe(`${TAG}${HEAD}<body>`);
  });

  test('injects when </head> is split across three chunks', () => {
    const { injector } = makeInjector();
    const out = injector.push('<head></') + injector.push('he') + injector.push('ad>end') + injector.flush();
    expect(out).toBe(`<head>${TAG}${HEAD}end`);
  });

  test('flush returns the held-back tail when no </head> exists', () => {
    const { injector, getTags } = makeInjector();
    const out = injector.push('<html><body></he') + injector.flush();
    expect(out).toBe('<html><body></he');
    expect(getTags).not.toHaveBeenCalled();
  });

  test('flush is empty after everything has been emitted', () => {
    const { injector } = makeInjector();
    injector.push('<head></head>');
    expect(injector.flush()).toBe('');
  });

  test('injects only into the first </head>', () => {
    const { injector, getTags } = makeInjector();
    const out = injector.push(`${HEAD}${HEAD}`) + injector.flush();
    expect(out).toBe(`${TAG}${HEAD}${HEAD}`);
    expect(getTags).toHaveBeenCalledTimes(1);
  });

  test('does not buffer text after injection', () => {
    const { injector } = makeInjector();
    injector.push(HEAD);
    expect(injector.push('<body></he')).toBe('<body></he');
    expect(injector.flush()).toBe('');
  });

  test('calls getTags lazily, only once, at injection time', () => {
    const { injector, getTags } = makeInjector();
    injector.push('<html><body>');
    expect(getTags).not.toHaveBeenCalled();
    injector.push(`${HEAD}`);
    injector.push(`${HEAD}`);
    expect(getTags).toHaveBeenCalledTimes(1);
  });
});
