import { ZalgoPromise } from '../src';

describe('flush', () => {
    it('resolves after every other synchronous task has completed', async () => {
        let count = 0;

        await ZalgoPromise.try(() => {
            const tasks = [
                ZalgoPromise.flush().then(() => {
                    expect(count).toBe(6);
                }),
                ZalgoPromise.try(() => {
                    count += 1;
                }),
                ZalgoPromise.try(() => {
                    count += 2;
                }),
                ZalgoPromise.try(() => {
                    count += 3;
                })
            ];

            return ZalgoPromise.all(tasks);
        });

        expect(count).toBe(6);
    });

    it('resolves immediately when nothing is running', () => {
        let flushed = false;

        ZalgoPromise.flush().then(() => {
            flushed = true;
        });

        expect(flushed).toBe(true);
    });

    it('shares one promise between callers waiting on the same burst', async () => {
        const seen : Array<string> = [];

        await ZalgoPromise.try(() => {
            const first = ZalgoPromise.flush().then(() => seen.push('first'));
            const second = ZalgoPromise.flush().then(() => seen.push('second'));

            expect(seen).toEqual([]);

            return ZalgoPromise.all([ first, second ]);
        });

        expect(seen).toEqual([ 'first', 'second' ]);
    });
});
