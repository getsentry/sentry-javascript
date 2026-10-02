import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from '../../../src/integrations/fastify/types';
import { defaultShouldHandleError } from '../../../src/integrations/fastify/utils';

const request: FastifyRequest = { method: 'POST', routeOptions: { url: '/' } };

function reply(statusCode: number): FastifyReply {
  return { statusCode } as FastifyReply;
}

function errorWith(props: { statusCode?: number; status?: number }): Error {
  return Object.assign(new Error('test error'), props);
}

describe('defaultShouldHandleError', () => {
  // Fastify runs `onError` hooks before it applies the error's status to the reply,
  // e.g. for a body that fails to parse, so `reply.statusCode` is still the default 200 there.
  describe('when the reply status has not been set yet', () => {
    it('skips errors carrying a 4xx `statusCode`', () => {
      expect(defaultShouldHandleError(errorWith({ statusCode: 400 }), request, reply(200))).toBe(false);
    });

    it('skips errors carrying a 4xx `status`', () => {
      expect(defaultShouldHandleError(errorWith({ status: 404 }), request, reply(200))).toBe(false);
    });

    it('skips errors carrying a 4xx status as a string', () => {
      expect(
        defaultShouldHandleError(Object.assign(new Error('test error'), { statusCode: '404' }), request, reply(200)),
      ).toBe(false);
    });

    it('captures errors carrying a 5xx status', () => {
      expect(defaultShouldHandleError(errorWith({ statusCode: 503 }), request, reply(200))).toBe(true);
    });

    it('captures errors without a status', () => {
      expect(defaultShouldHandleError(new Error('test error'), request, reply(200))).toBe(true);
    });

    it.each([null, undefined, 'a string', 404])(
      'captures a thrown non-object (%s), which Fastify sends as a 500',
      error => {
        expect(defaultShouldHandleError(error as unknown as Error, request, reply(200))).toBe(true);
      },
    );

    it('captures errors carrying a status below 400, which Fastify sends as a 500', () => {
      expect(defaultShouldHandleError(errorWith({ statusCode: 302 }), request, reply(200))).toBe(true);
    });
  });

  describe('when the reply status has been set', () => {
    it('skips errors on a 4xx reply', () => {
      expect(defaultShouldHandleError(new Error('test error'), request, reply(404))).toBe(false);
    });

    it('skips errors on a 3xx reply', () => {
      expect(defaultShouldHandleError(new Error('test error'), request, reply(302))).toBe(false);
    });

    it('captures errors on a 5xx reply', () => {
      expect(defaultShouldHandleError(errorWith({ statusCode: 400 }), request, reply(500))).toBe(true);
    });
  });
});
