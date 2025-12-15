import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/node';

export type ServerEntry = { fetch?: (request: Request) => Promise<unknown> };

/**
 *
 * @param serverEntry - server entry function to wrap
 * @returns - wrapped server entry function
 */
export function withSentry(serverEntry: ServerEntry): ServerEntry {
  if (serverEntry.fetch) {
    serverEntry.fetch = new Proxy<typeof serverEntry.fetch>(serverEntry.fetch, {
      apply: async (target, thisArg, args) => {
        console.log(args[0].url?.toString());
        console.log('serverFn: ', args[0].url?.includes('_serverFn') || args[0].url?.includes('createServerFn'));
        if (args[0].url?.includes('_serverFn') || args[0].url?.includes('createServerFn')) {
          const op = 'function.tanstackstart';
          console.log('fetch with startSpan');
          return await startSpan(
            {
              op: op,
              name: 'server.fetch', // TODO: use the actual server function name
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.tanstackstart.serverFn',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
              },
            },
            async () => {
              return await target.apply(thisArg, args);
            },
          );
        }

        return await target.apply(thisArg, args);
      },
    });
  }
  return serverEntry;
}
