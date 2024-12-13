import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExampleModuleGlobalFilterRegisteredFirst } from './example-module-global-filter-registered-first/example.module';
import { ExampleModuleGlobalFilter } from './example-module-global-filter/example.module';
import { ExampleModuleLocalFilter } from './example-module-local-filter/example.module';
import { ExampleSpecificFilter } from './example-specific.filter';

@Module({
  imports: [
    ExampleModuleGlobalFilterRegisteredFirst,
    SentryModule.forRoot(),
    ExampleModuleGlobalFilter,
    ExampleModuleLocalFilter,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_FILTER,
      useClass: ExampleSpecificFilter,
    },
  ],
})
export class AppModule {}
