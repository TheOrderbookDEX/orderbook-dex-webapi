export abstract class EventTargetX extends EventTarget {
    private _listeners: { [type: string]: Set<unknown> } = new Proxy({}, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get(target: any, prop) {
            return target[prop] ?? (target[prop] = new Set);
        }
    });

    private _addListener(type: string, callback: EventListenerOrEventListenerObject | null) {
        if (!this._hasListeners()) this._activateUpdater();
        this._listeners[type].add(callback);
    }

    private _removeListener(type: string, callback: EventListenerOrEventListenerObject | null) {
        if (this._listeners[type].has(callback)) {
            this._listeners[type].delete(callback);
            if (!this._hasListeners()) this._deactivateUpdater();
        }
    }

    private _hasListeners() {
        return Object.values(this._listeners).some(set => set.size);
    }

    protected abstract _activateUpdater(): void;
    protected abstract _deactivateUpdater(): void;

    addEventListener(type: string, callback: EventListenerOrEventListenerObject  | null, options?: boolean | AddEventListenerOptions): void {
        this._addListener(type, callback);
        if (typeof options == 'object') {
            if (options.once) {
                super.addEventListener(type, () => this._removeListener(type, callback), options);
            }
            if (options.signal) {
                options.signal.addEventListener('abort', () => this._removeListener(type, callback), { once: true });
            }
        }
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
        this._removeListener(type, callback);
        super.removeEventListener(type, callback, options);
    }

    /** @internal */
    dispatchEvent(event: Event): boolean {
        return super.dispatchEvent(event);
    }
}
