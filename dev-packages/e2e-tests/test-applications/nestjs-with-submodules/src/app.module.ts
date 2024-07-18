import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExampleModule } from './example-module/example.module';
import { SentryIntegrationModule } from '@sentry/nestjs/setup';

@Module({
  imports: [SentryIntegrationModule.forRoot(), ExampleModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
