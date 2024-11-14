import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { TestEventListener } from './listeners/test-event.listener';
import { EventsController } from './events.controller';
import { APP_FILTER } from '@nestjs/core';
import { EventsService } from './events.service';

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
