import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { TestProcessor } from './jobs/test.processor';

@Module({
  imports: [
    SentryModule.forRoot(),
    BullModule.forRoot({
      // CI: Redis runs on the GHA host via docker compose; REDIS_HOST is set in the workflow.
      connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 },
    }),
    BullModule.registerQueue({ name: 'test-queue' }),
  ],
  controllers: [AppController],
  providers: [
    TestProcessor,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
