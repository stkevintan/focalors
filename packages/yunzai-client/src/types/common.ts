export type PromiseOrNot<T> = T | PromiseLike<T>;
export type Constructor<T, R extends any[] = any[]> = new (...args: R) => T;
export interface AsyncService {
    start(): Promise<void>;
    stop(): Promise<void>;
}
