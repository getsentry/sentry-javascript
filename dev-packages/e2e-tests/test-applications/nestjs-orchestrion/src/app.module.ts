import { MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsService } from './events.service';
import { ExampleExceptionFilter } from './example.filter';
import { ExampleMiddleware } from './example.middleware';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [EventEmitterModule.forRoot(), ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [
    AppService,
    EventsService,
    ScheduleService,
    // Global exception filter
    // exercises the `@Catch` (exception_filter) instrumentation.
    {
      provide: APP_FILTER,
      useClass: ExampleExceptionFilter,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ExampleMiddleware).forRoutes('test-middleware');
  }
}
