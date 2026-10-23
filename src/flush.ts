// How many handlers are running right now. `flush()` resolves once that
// drops to zero, so work can be deferred until every synchronous chain that
// is currently executing has finished.
import type { ZalgoPromise } from './promise';

let activeCount = 0;
let flushPromise : ZalgoPromise<void> | undefined;

const flushActive = () : void => {
    if (!activeCount && flushPromise) {
        const promise = flushPromise;

        flushPromise = undefined;
        promise.resolve();
    }
};

export const startActive = () : void => {
    activeCount += 1;
};

export const endActive = () : void => {
    activeCount -= 1;
    flushActive();
};

type AwaitActiveOptions = {
    readonly create : () => ZalgoPromise<void>,
};

// One shared promise for everyone waiting on the current burst of work.
export const awaitActive = ({ create } : AwaitActiveOptions) : ZalgoPromise<void> => {
    flushPromise ??= create();

    const promise = flushPromise;

    flushActive();

    return promise;
};
