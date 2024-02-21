// We cannot make any assumptions about what users define as their handler except maybe that it is a function
export interface EdgeRouteHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: any[]): any;
}
