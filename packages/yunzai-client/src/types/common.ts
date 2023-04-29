export type PromiseOrNot<T> = T | PromiseLike<T>;
export type Constructor<T, R extends any[] = any[]> = new (...args: R) => T;