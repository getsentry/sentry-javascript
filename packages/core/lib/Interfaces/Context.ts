import { IUser } from './User';

export interface IContext {
  tags?: any;
  extra?: any;
  user?: IUser;
}

export function getDefaultContext() {
  return {};
}

export function set<T extends IContext, K extends keyof T>(
  context: T,
  key: K,
  value: any
) {
  context[key] = value;
}

export function mergeIn<T extends IContext, K extends keyof T>(
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
