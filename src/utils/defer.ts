export class Defer<T> {
    private resolver?: (x: T) => void;
    private rejecter?: (err: unknown) => void;
    private completed = false;
    readonly promise = new Promise<T>((res, rej) => {
        this.resolver = res;
        this.rejecter = rej;
    });

    resolve(x: T) {
        if (!this.completed) {
            this.resolver?.(x);
            this.completed = true;
        }
    }

    reject(err: unknown) {
        if (!this.completed) {
            this.rejecter?.(err);
            this.completed = true;
        }
    }
}
