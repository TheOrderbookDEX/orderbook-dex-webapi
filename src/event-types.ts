export type GenericEventListener<T extends Event> = GenericEventListenerFunction<T> | GenericEventListenerObject<T>;

export interface GenericEventListenerFunction<T extends Event> {
    (event: T): void;
}

export interface GenericEventListenerObject<T extends Event> {
    handleEvent(event: T): void;
}
