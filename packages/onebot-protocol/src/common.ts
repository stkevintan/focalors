export type PromiseOrNot<T> = T | PromiseLike<T>;
export interface AsyncService {
    start(): Promise<void>;
    stop(): Promise<void>;
}
