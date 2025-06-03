import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { sentryTracingMiddleware } from './sentry-middleware';

const PlanetSchema = z.object({
  id: z.number().int().min(1),
  name: z.string(),
  description: z.string().optional(),
});

export const base = os.use(sentryTracingMiddleware);

export const listPlanet = base
  .input(
    z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ input }) => {
    return [
      { id: 1, name: 'name' },
      { id: 2, name: 'another name' },
    ];
  });

export const findPlanet = base.input(PlanetSchema.pick({ id: true })).handler(async ({ input }) => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return { id: 1, name: 'name' };
});

export const throwingFindPlanet = base.input(PlanetSchema.pick({ id: true })).handler(async ({ input }) => {
  throw new ORPCError('OH_OH', {
    message: 'You are hitting an error',
    data: { some: 'data' },
  });
});

export const router = {
  planet: {
    list: listPlanet,
    find: findPlanet,
    findWithError: throwingFindPlanet,
  },
};
