import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro:schema';

export const server = {
  testAction: defineAction({
    input: z.object({
      name: z.string(),
      shouldError: z.boolean().optional(),
    }),
    handler: async input => {
      if (input.shouldError) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Test Action Error',
        });
      }

      return {
        status: 'success',
        name: input.name,
      };
    },
  }),
};
