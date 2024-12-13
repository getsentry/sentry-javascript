import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ExampleController } from './example.controller';
import { ExampleExceptionFilterRegisteredFirst } from './example.filter';

@Module({
  imports: [],
  controllers: [ExampleController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ExampleExceptionFilterRegisteredFirst,
    },
  ],
})
export class ExampleModuleGlobalFilterRegisteredFirst {}
