import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExampleMiddleware } from './example.middleware';
import { APP_FILTER } from "@nestjs/core";
import { BadRequestExceptionFilter } from "./bad-request.filter";

@Module({
  imports: [SentryModule.forRoot(), ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [
    AppService,
      {
        provide: APP_FILTER,
        useClass: BadRequestExceptionFilter
      }
    ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ExampleMiddleware).forRoutes('test-middleware-instrumentation');
  }
}
