// @vitest-environment node
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import releasePlugin from '../../src/nitro/releasePlugin';

type BeforeResponseHook = (event: unknown, response: { body?: unknown }) => void;

function setUpPlugin(): { beforeResponse: BeforeResponseHook } {
  let beforeResponse: BeforeResponseHook = () => {};
  releasePlugin({
    hooks: {
      hook: (_name: string, fn: BeforeResponseHook) => {
        beforeResponse = fn;
      },
    },
  } as never);
  return { beforeResponse };
}

function createEvent(contentType: string): { node: { res: { getHeader: () => string; removeHeader: () => void } } } {
  return { node: { res: { getHeader: () => contentType, removeHeader: vi.fn() } } };
}

afterEach(() => {
  delete (GLOBAL_OBJ as { __sentry_solidstart_release?: string }).__sentry_solidstart_release;
});

describe('releasePlugin', () => {
  it('adds the release that the server bundle sets to HTML pages', () => {
    (GLOBAL_OBJ as { __sentry_solidstart_release?: string }).__sentry_solidstart_release = '1.0.0';
    const { beforeResponse } = setUpPlugin();
    const event = createEvent('text/html');
    const response = { body: '<head></head>' };

    beforeResponse(event, response);

    expect(response.body).toBe('<head><meta name="sentry-release" content="1.0.0"/></head>');
    expect(event.node.res.removeHeader).toHaveBeenCalledWith('content-length');
  });

  it('leaves the page alone when the server bundle sets no release', () => {
    const { beforeResponse } = setUpPlugin();
    const event = createEvent('text/html');
    const response = { body: '<head></head>' };

    beforeResponse(event, response);

    expect(response.body).toBe('<head></head>');
    expect(event.node.res.removeHeader).not.toHaveBeenCalled();
  });
});
