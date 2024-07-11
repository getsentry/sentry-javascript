import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TestController } from './test.controller';
import { TestExceptionFilter } from './test.filter';

@Module({
  imports: [],
  controllers: [TestController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: TestExceptionFilter,
    },
  ],
})
export class TestModule {}
