export class TestException extends Error {
  constructor() {
    super("Something went wrong in the test module!");
  }
}
