import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ExamplePipe implements PipeTransform {
  transform(value: any) {
    return value;
  }
}
