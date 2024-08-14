import { Module } from '@nestjs/common';
import { ExampleControllerLocalFilter } from './example.controller';

@Module({
  imports: [],
  controllers: [ExampleControllerLocalFilter],
  providers: [],
})
export class ExampleModuleLocalFilter {}
