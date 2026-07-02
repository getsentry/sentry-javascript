import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';

@Controller()
class AppController {
  @Get('/test-transaction')
  public testTransaction(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [AppController] })
class AppModule {}

async function bootstrap(): Promise<void> {
  // `NestFactory.create` -> the `Create Nest App` (app_creation) span
  // the route -> `request_context` + `handler` spans, all via the
  // orchestrion subscriber
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  await app.listen(0);
  const address = app.getHttpServer().address();
  sendPortToRunner(typeof address === 'object' && address ? address.port : 0);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
