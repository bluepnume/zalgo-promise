import { ZalgoPromise } from '../src';

describe('windows are never treated as promises', () => {
    it('does not read then off the window', () => {
        let accessed = false;

        Object.defineProperty(window, 'then', {
            configurable: true,

            get: () => {
                accessed = true;

                return () => undefined;
            }
        });

        try {
            // Checked inside the chain: handing the window to a native
            // promise would make *that* promise read `then`, which is the
            // very thing this library avoids.
            let result : unknown;

            ZalgoPromise.resolve('foobar').then(() => window).then(value => {
                result = value;
            });

            expect(result).toBe(window);
            expect(accessed).toBe(false);
            expect(ZalgoPromise.isPromise(window)).toBe(false);
        } finally {
            // @ts-expect-error -- the test property is being removed again
            delete window.then;
        }
    });

    it('does not treat a cross-origin window as a promise', () => {
        const frame = document.createElement('iframe');

        document.body.append(frame);

        try {
            expect(ZalgoPromise.isPromise(frame.contentWindow)).toBe(false);
        } finally {
            frame.remove();
        }
    });
});
