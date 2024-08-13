export class ExampleExceptionRegisteredFirst extends Error {
  constructor() {
    super('Something went wrong in the example module!');
  }
}
