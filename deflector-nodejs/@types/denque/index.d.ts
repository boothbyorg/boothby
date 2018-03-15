declare module "denque" {
  class Denque<T> {
    public constructor();
    public constructor(items: T[]);
    public push(item: T): void;
    public unshift(item: T): void;
    public pop(): T | undefined;
    public shift(): T | undefined;
    public toArray(): T[];
    public peekBack(): T | undefined;
    public peekFront(): T | undefined;
    public peekAt(index: number): T | undefined;
    public remove(index: number, count: number): T[] | undefined;
    public removeOne(index: number): T | undefined;
    public splice(index: number, count: number, ...items: T[]): T[] | undefined;
    public isEmpty(): boolean;
    public clear(): void;
    public size(): number;
  }

  export = Denque;
}
