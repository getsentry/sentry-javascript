import { Module } from '@nestjs/common';
import { SentryIntegrationModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExampleModuleGlobalFilter } from './example-module-global-filter/example.module';

@Module({
  imports: [SentryIntegrationModule.forRoot(), ExampleModuleGlobalFilter],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
