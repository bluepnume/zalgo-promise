// Anything with a `then` method counts as a promise, with one exception: a
// window. A page can define `window.then`, and a cross-origin window throws
// on the access, so windows are ruled out before `then` is ever read.
export const isPromise = (item : unknown) : item is PromiseLike<unknown> => {
    if (!item || (typeof item !== 'object' && typeof item !== 'function')) {
        return false;
    }

    if (item instanceof Promise) {
        return true;
    }

    if (typeof Window !== 'undefined' && item instanceof Window) {
        return false;
    }

    try {
        return typeof (item as { then ?: unknown }).then === 'function';
    } catch {
        // A cross-origin window, or a getter that throws: not a promise.
        return false;
    }
};
