import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
  @Query(() => String)
  hello(): string {
    return 'Hello World!';
  }

  @Query(() => String)
  error(): string {
    throw new Error('This is an exception!');
  }
}
