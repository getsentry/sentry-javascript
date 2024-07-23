import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ExampleController } from './example.controller';
import { ExampleExceptionFilterWrongRegistrationOrder } from './example.filter';

@Module({
  imports: [],
  controllers: [ExampleController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ExampleExceptionFilterWrongRegistrationOrder,
    },
  ],
})
export class ExampleModuleGlobalFilterWrongRegistrationOrder {}
