import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
  @Query(() => String)
  test(): string {
    return 'Test endpoint!';
  }

  @Query(() => String)
  error(): string {
    throw new Error('This is an exception!');
  }
}
