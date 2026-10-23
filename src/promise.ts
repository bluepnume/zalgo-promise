import type { Cancelable, PossiblyUnhandledExceptionHandler } from './exceptions';

import { dispatchPossiblyUnhandledError, onPossiblyUnhandledException } from './exceptions';
import { awaitActive, endActive, startActive } from './flush';
import { isPromise } from './utils';

export type Executor<R> = (
    resolve : (result : R) => void,
    reject : (error : unknown) => void
) => void;

type OnSuccess<R, X> = ((result : R) => X | PromiseLike<X>) | null | undefined;
type OnError<Y> = ((error : unknown) => Y | PromiseLike<Y>) | null | undefined;

// Method signatures, not function properties, so that a ZalgoPromise<string>
// is assignable to a ZalgoPromise<unknown> the way a native Promise is.
/* eslint-disable @typescript-eslint/method-signature-style -- bivariance is the point */
type Handler<R> = {
    readonly promise : ZalgoPromise,
    onSuccess ?(result : R) : unknown,
    onError ?(error : unknown) : unknown,
};
/* eslint-enable @typescript-eslint/method-signature-style */

type Settled<T> = { readonly [ K in keyof T ] : Awaited<T[K]> };

type Settlement<R> =
    | { readonly kind : 'resolved', readonly result : R }
    | { readonly kind : 'rejected', readonly error : unknown };

const isCallable = (value : unknown) : value is (...args : ReadonlyArray<never>) => unknown =>
    typeof value === 'function';

// A promise that settles synchronously when it can: a handler attached to an
// already-settled promise runs before `then` returns, and resolving a pending
// promise runs its handlers before `resolve` returns. Everything else follows
// the native Promise contract, and `await` works on it.
export class ZalgoPromise<R = unknown> implements PromiseLike<R> {
    resolved = false;

    rejected = false;

    // Set once anything has attached a handler, or `lazy()` opted out, so a
    // rejection with nobody listening can be reported.
    errorHandled = false;

    value ! : R;

    error : unknown;

    private readonly handlers : Array<Handler<R>> = [];

    private dispatching = false;

    constructor(executor ?: Executor<R>) {
        if (!executor) {
            return;
        }

        // Settlement inside the executor is recorded and applied once it
        // returns; settlement after that applies directly.
        const state : { settled ?: Settlement<R>, running : boolean } = { running: true };

        startActive();

        try {
            executor(
                result => {
                    if (state.running) {
                        state.settled = { kind: 'resolved', result };
                    } else {
                        this.resolve(result);
                    }
                },
                error => {
                    if (state.running) {
                        state.settled = { kind: 'rejected', error };
                    } else {
                        this.reject(error);
                    }
                }
            );
        } catch (err) {
            endActive();
            this.reject(err);

            return;
        }

        endActive();
        state.running = false;

        if (state.settled?.kind === 'resolved') {
            this.resolve(state.settled.result);
        } else if (state.settled?.kind === 'rejected') {
            this.reject(state.settled.error);
        }
    }

    resolve(result : R) : this {
        if (this.resolved || this.rejected) {
            return this;
        }

        if (isPromise(result)) {
            throw new Error('Can not resolve promise with another promise');
        }

        this.resolved = true;
        this.value = result;
        this.dispatch();

        return this;
    }

    reject(error : unknown) : this {
        if (this.resolved || this.rejected) {
            return this;
        }

        if (isPromise(error)) {
            throw new Error('Can not reject promise with another promise');
        }

        // A falsy rejection is almost always a mistake; make it an Error so
        // whoever catches it has something to look at.
        const reason : unknown = error
            ? error
            : new Error(`Expected reject to be called with Error, got ${ String(error) }`);

        this.rejected = true;
        this.error = reason;

        if (!this.errorHandled) {
            setTimeout(() => {
                if (!this.errorHandled) {
                    dispatchPossiblyUnhandledError({ error: reason, promise: this });
                }
            }, 1);
        }

        this.dispatch();

        return this;
    }

    // Reject without ever reporting it as unhandled.
    asyncReject(error : unknown) : this {
        this.errorHandled = true;
        this.reject(error);

        return this;
    }

    private dispatch() : void {
        const { dispatching, resolved, rejected, handlers } = this;

        if (dispatching || (!resolved && !rejected)) {
            return;
        }

        this.dispatching = true;
        startActive();

        for (const handler of handlers) {
            const { promise } = handler;
            let result : unknown;

            try {
                if (resolved) {
                    result = handler.onSuccess
                        ? handler.onSuccess(this.value)
                        : this.value;
                } else if (handler.onError) {
                    result = handler.onError(this.error);
                } else {
                    promise.reject(this.error);
                    continue;
                }
            } catch (err) {
                promise.reject(err);
                continue;
            }

            if (result instanceof ZalgoPromise && (result.resolved || result.rejected)) {
                if (result.resolved) {
                    promise.resolve(result.value);
                } else {
                    promise.reject(result.error);
                }

                result.errorHandled = true;
            } else if (isPromise(result)) {
                ZalgoPromise.resolve(result).then(
                    res => {
                        promise.resolve(res);
                    },
                    (err : unknown) => {
                        promise.reject(err);
                    }
                );
            } else {
                promise.resolve(result);
            }
        }

        handlers.length = 0;
        this.dispatching = false;
        endActive();
    }

    then<X = R, Y = never>(onSuccess ?: OnSuccess<R, X>, onError ?: OnError<Y>) : ZalgoPromise<X | Y> {
        if (onSuccess && !isCallable(onSuccess)) {
            throw new TypeError('Promise.then expected a function for success handler');
        }

        if (onError && !isCallable(onError)) {
            throw new TypeError('Promise.then expected a function for error handler');
        }

        const promise = new ZalgoPromise<X | Y>();

        this.handlers.push({ promise, onSuccess: onSuccess ?? undefined, onError: onError ?? undefined });
        this.errorHandled = true;
        this.dispatch();

        return promise;
    }

    catch<Y = never>(onError : OnError<Y>) : ZalgoPromise<R | Y> {
        return this.then<R, Y>(undefined, onError);
    }

    finally(onFinally : () => unknown) : ZalgoPromise<R> {
        if (!isCallable(onFinally)) {
            throw new TypeError('Promise.finally expected a function');
        }

        return this.then(
            result => ZalgoPromise.try(onFinally).then(() => result),
            (err : unknown) => ZalgoPromise.try(onFinally).then(() => {
                throw err;
            })
        );
    }

    // Reject after `time` milliseconds unless settled first.
    timeout(time : number, err ?: Error) : ZalgoPromise<R> {
        if (this.resolved || this.rejected) {
            return this;
        }

        const timer = setTimeout(() => {
            if (!this.resolved && !this.rejected) {
                this.reject(err ?? new Error(`Promise timed out after ${ time }ms`));
            }
        }, time);

        return this.then(result => {
            clearTimeout(timer);

            return result;
        });
    }

    toPromise() : Promise<R> {
        return Promise.resolve(this);
    }

    // Opt out of unhandled-rejection reporting for this promise.
    lazy() : this {
        this.errorHandled = true;

        return this;
    }

    static resolve() : ZalgoPromise<void>;
    static resolve<X>(value : X | PromiseLike<X>) : ZalgoPromise<X>;
    static resolve<X>(value ?: X | PromiseLike<X>) : ZalgoPromise<X | undefined> {
        if (value instanceof ZalgoPromise) {
            return value as ZalgoPromise<X>;
        }

        if (isPromise(value)) {
            return new ZalgoPromise<X>((resolve, reject) => {
                Promise.resolve(value).then(resolve, reject).catch(reject);
            });
        }

        return new ZalgoPromise<X | undefined>().resolve(value);
    }

    static reject<X = never>(error : unknown) : ZalgoPromise<X> {
        return new ZalgoPromise<X>().reject(error);
    }

    static asyncReject<X = never>(error : unknown) : ZalgoPromise<X> {
        return new ZalgoPromise<X>().asyncReject(error);
    }

    static all<T extends ReadonlyArray<unknown>>(promises : T) : ZalgoPromise<Settled<T>> {
        const promise = new ZalgoPromise<Settled<T>>();
        const results : Array<unknown> = [];
        let count = promises.length;

        const settle = () : void => {
            if (count === 0) {
                promise.resolve(results as unknown as Settled<T>);
            }
        };

        promises.forEach((item, index) => {
            if (item instanceof ZalgoPromise && item.resolved) {
                results[index] = item.value;
                count -= 1;

                return;
            }

            if (!isPromise(item)) {
                results[index] = item;
                count -= 1;

                return;
            }

            ZalgoPromise.resolve(item).then(
                res => {
                    results[index] = res;
                    count -= 1;
                    settle();
                },
                (err : unknown) => {
                    promise.reject(err);
                }
            );
        });

        settle();

        return promise;
    }

    static hash<O extends Record<string, unknown>>(promises : O) : ZalgoPromise<Settled<O>> {
        const result : Record<string, unknown> = {};
        const pending : Array<ZalgoPromise<void>> = [];

        for (const [ key, value ] of Object.entries(promises)) {
            if (isPromise(value)) {
                pending.push(ZalgoPromise.resolve(value).then(res => {
                    result[key] = res;
                }));
            } else {
                result[key] = value;
            }
        }

        return ZalgoPromise.all(pending).then(() => result as Settled<O>);
    }

    static map<T, X>(
        items : ReadonlyArray<T>,
        method : (item : T) => X | PromiseLike<X>
    ) : ZalgoPromise<ReadonlyArray<X>> {
        return ZalgoPromise.all(items.map(method));
    }

    static onPossiblyUnhandledException(handler : PossiblyUnhandledExceptionHandler) : Cancelable {
        return onPossiblyUnhandledException(handler);
    }

    // Run `method` now; a throw becomes a rejection, a return a resolution.
    static try<X, Args extends ReadonlyArray<unknown>, Context = undefined>(
        method : (this : Context, ...args : Args) => X | PromiseLike<X>,
        context ?: Context,
        args ?: Args
    ) : ZalgoPromise<X> {
        if (!isCallable(method)) {
            throw new TypeError('Promise.try expected a function');
        }

        let result : X | PromiseLike<X>;

        startActive();

        try {
            result = Reflect.apply(method, context, args ?? []) as X | PromiseLike<X>;
        } catch (err) {
            endActive();

            return ZalgoPromise.reject(err);
        }

        endActive();

        return ZalgoPromise.resolve(result);
    }

    static delay(delay : number) : ZalgoPromise<void> {
        return new ZalgoPromise<void>(resolve => {
            setTimeout(resolve, delay);
        });
    }

    static isPromise(value : unknown) : boolean {
        return value instanceof ZalgoPromise || isPromise(value);
    }

    // Resolves once every handler currently running has finished.
    static flush() : ZalgoPromise<void> {
        return awaitActive({ create: () => new ZalgoPromise<void>() });
    }
}

