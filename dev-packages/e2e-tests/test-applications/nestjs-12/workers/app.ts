import { NestFactory } from '@nestjs/core';
import { httpServerHandler } from 'cloudflare:node';
import { AppModule } from '../dist/app.module.js';

const PORT = 3030;

let listening: Promise<void> | undefined;

// workerd allows no I/O at module scope, so Nest boots in the first request.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT);
}

const handler = httpServerHandler({ port: PORT });

export default {
  async fetch(request, env, ctx) {
    listening ??= bootstrap();
    await listening;
    return handler.fetch(request, env, ctx);
  },
};
