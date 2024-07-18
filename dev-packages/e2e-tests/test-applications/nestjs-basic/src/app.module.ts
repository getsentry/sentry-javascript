import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryIntegrationModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [SentryIntegrationModule.forRoot(), ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
