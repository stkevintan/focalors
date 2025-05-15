export class Queue<T> {
    private items: T[] = [];

    // Adds an item to the end of the queue
    enqueue(item: T): void {
        this.items.push(item);
    }

    // Removes and returns the item at the front of the queue
    // Throws an error if the queue is empty
    dequeue(): T {
        if (this.isEmpty()) {
            throw new Error("Queue is empty");
        }
        return this.items.shift()!;
    }

    // Checks if the queue is empty
    isEmpty(): boolean {
        return this.items.length === 0;
    }
}
