import type { ZalgoPromise } from './promise';

export type PossiblyUnhandledExceptionHandler = (error : unknown, promise : ZalgoPromise) => void;

export type Cancelable = {
    readonly cancel : () => void,
};

// Errors already reported, so a rejection shared by several promises is
// raised once. Weak, so a reported error can still be collected.
const dispatchedErrors = new WeakSet();
const handlers : Array<PossiblyUnhandledExceptionHandler> = [];

type DispatchPossiblyUnhandledErrorOptions = {
    readonly error : unknown,
    readonly promise : ZalgoPromise,
};

export const dispatchPossiblyUnhandledError = ({ error, promise } : DispatchPossiblyUnhandledErrorOptions) : void => {
    if (typeof error === 'object' && error !== null) {
        if (dispatchedErrors.has(error)) {
            return;
        }

        dispatchedErrors.add(error);
    }

    // Surface it the way an uncaught exception would be, off the current
    // stack so it cannot be swallowed by whoever is running right now.
    setTimeout(() => {
        throw error;
    }, 1);

    for (const handler of handlers) {
        handler(error, promise);
    }
};

export const onPossiblyUnhandledException = (handler : PossiblyUnhandledExceptionHandler) : Cancelable => {
    handlers.push(handler);

    return {
        cancel: () => {
            const index = handlers.indexOf(handler);

            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    };
};
