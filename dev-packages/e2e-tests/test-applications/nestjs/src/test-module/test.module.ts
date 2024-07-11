import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { APP_FILTER } from '@nestjs/core';
import { TestExceptionFilter } from './test.filter';

@Module({
  imports: [],
  controllers: [TestController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: TestExceptionFilter,
    }
  ]
})
export class TestModule {}
