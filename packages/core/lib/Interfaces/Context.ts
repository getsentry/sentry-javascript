import {User} from './User';

export type Context = {
  tags?: any;
  extra?: any;
  user?: User;
};

export namespace Context {
  export function getDefaultContext() {
    return {};
  }

  export function set<T extends Context, K extends keyof T>(
    context: T,
    key: K,
    value: any
  ) {
    context[key] = value;
  }

  export function merge<T extends Context, K extends keyof T>(
    context: T,
    key: K,
    value: any
  ) {
    if (!context[key]) {
      set(context, key, {});
    }
    if (value === undefined) {
      delete context[key];
    } else {
      Object.assign(context[key], value);
    }
  }
}
