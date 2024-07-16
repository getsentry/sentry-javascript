import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryIntegrationModule } from '@sentry/nestjs';
import { AppController1, AppController2 } from './app.controller';
import { AppService1, AppService2 } from './app.service';
import { ExampleModule } from './example-module/example.module';

@Module({
  imports: [SentryIntegrationModule.forRoot(), ScheduleModule.forRoot(), ExampleModule], // TODO: check if the order of registration matters
  controllers: [AppController1],
  providers: [AppService1],
})
export class AppModule1 {}

@Module({
  imports: [],
  controllers: [AppController2],
  providers: [AppService2],
})
export class AppModule2 {}
