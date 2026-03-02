import { HttpApiBuilder, HttpMiddleware, HttpServer } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Layer } from 'effect';
import { createServer } from 'http';
import { Api } from './Api.js';
import { HttpTestLive } from './Test/Http.js';

const ApiLive = Layer.provide(HttpApiBuilder.api(Api), [HttpTestLive]);

export const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3030 })),
);
