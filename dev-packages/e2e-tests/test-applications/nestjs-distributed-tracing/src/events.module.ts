import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TestEventListener } from './listeners/test-event.listener';

@Module({
  imports: [SentryModule.forRoot(), EventEmitterModule.forRoot()],
  controllers: [EventsController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    EventsService,
    TestEventListener,
  ],
})
export class EventsModule {}
