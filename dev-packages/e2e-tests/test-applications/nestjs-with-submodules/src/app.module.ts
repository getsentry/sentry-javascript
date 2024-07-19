import { Module } from '@nestjs/common';
import { SentryIntegrationModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExampleModuleGlobalFilter } from './example-module-global-filter/example.module';
import { ExampleModuleLocalFilter } from './example-module-local-filter/example.module';

@Module({
  imports: [SentryIntegrationModule.forRoot(), ExampleModuleGlobalFilter, ExampleModuleLocalFilter],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
