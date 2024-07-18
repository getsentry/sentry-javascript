import { Module } from '@nestjs/common';
import { SentryIntegrationModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExampleModule } from './example-module/example.module';

@Module({
  imports: [SentryIntegrationModule.forRoot(), ExampleModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
