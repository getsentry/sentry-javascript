import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExampleModuleGlobalFilterWrongRegistrationOrder } from './example-module-global-filter-wrong-registration-order/example.module';
import { ExampleModuleGlobalFilter } from './example-module-global-filter/example.module';
import { ExampleModuleLocalFilter } from './example-module-local-filter/example.module';

@Module({
  imports: [
    ExampleModuleGlobalFilterWrongRegistrationOrder,
    SentryModule.forRoot(),
    ExampleModuleGlobalFilter,
    ExampleModuleLocalFilter,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
