# zalgo-promise

A promise that settles synchronously when it can.

```sh
npm install zalgo-promise
```

```ts
import { ZalgoPromise } from 'zalgo-promise';

const promise = new ZalgoPromise<string>(resolve => resolve('now'));

promise.then(value => {
    // Runs before `then` returns: the promise was already settled.
});

await promise;   // Also a plain thenable, so `await` and Promise.all work.
```

ES modules, TypeScript types included, no dependencies. Runs anywhere with `setTimeout`; the syntax is ES2019.

## Rationale

Native promises are asynchronous by default. This:

```js
Promise.resolve('foo').then(result => console.log(result));
console.log('bar');
```

logs `bar` then `foo`. Even when nothing asynchronous happens, the handler waits for the current task to finish. That is, generally speaking, a good thing, and it is the right default for application code.

It is a problem in two places:

- **User gestures.** Some things a page may only do inside a user gesture: open a popup, request fullscreen, write to the clipboard. Browsers keep a gesture alive for a few seconds now, but a chain of asynchronous steps between the click and the `window.open` is still a chain of chances to lose it.
- **Background windows.** Browsers throttle timers, and in places microtasks, for a window that is not focused. Code in a popup talking to its opener, or an opener talking to a popup, can stall on every `.then` while the user looks at the other window.

`ZalgoPromise` settles synchronously whenever it can: resolving a pending promise runs its handlers before `resolve` returns, and attaching a handler to a settled promise runs it before `then` returns. It only becomes asynchronous when something asynchronous actually happens: a timer, a network call, a message from another window.

```ts
new ZalgoPromise(resolve => resolve()).then(() => {
    // Called synchronously.
});

new ZalgoPromise(resolve => setTimeout(resolve, 100)).then(() => {
    // Called asynchronously, because the resolution was.
});
```

The name is from [Isaac Schlueter's warning](https://blog.izs.me/2013/08/designing-apis-for-asynchrony/) that an API which is sometimes synchronous and sometimes asynchronous releases Zalgo. It does; this library releases him on purpose, for the two cases above, and asks you to keep him on a leash everywhere else. The [original write-up](https://medium.com/@bluepnume/intentionally-unleashing-zalgo-with-promises-ab3f63ead2fd) has the longer argument.

## API

The instance API follows `Promise`, plus a few things a synchronous promise can offer.

| Member | Does |
| --- | --- |
| `new ZalgoPromise(executor?)` | Like `new Promise`; with no executor, a pending promise you settle yourself |
| `promise.resolve(value)` / `promise.reject(error)` | Settle it; a second call is ignored. Rejecting with a falsy value rejects with an `Error` describing that |
| `then`, `catch`, `finally` | As on `Promise`; handlers run synchronously when the promise is already settled |
| `timeout(ms, error?)` | Reject after `ms` unless settled first |
| `toPromise()` | A native `Promise` with the same outcome |
| `lazy()` | Opt this promise out of unhandled-rejection reporting |
| `asyncReject(error)` | Reject without reporting it as unhandled |

| Static | Does |
| --- | --- |
| `ZalgoPromise.resolve(value?)` | A settled promise; a `ZalgoPromise` is returned as is, any other thenable is adopted |
| `ZalgoPromise.reject(error)` / `asyncReject(error)` | A rejected promise, reported or not |
| `ZalgoPromise.try(fn, context?, args?)` | Run `fn` now; a throw becomes a rejection |
| `ZalgoPromise.all(array)` / `hash(object)` / `map(array, fn)` | Combine, by position or by key; plain values pass through |
| `ZalgoPromise.delay(ms)` | Resolves after `ms` |
| `ZalgoPromise.isPromise(value)` | Whether `value` is a `ZalgoPromise`, a `Promise`, or any thenable; never true for a window |
| `ZalgoPromise.flush()` | Resolves once every handler currently running has finished |
| `ZalgoPromise.onPossiblyUnhandledException(handler)` | Hear about rejections nobody handled; returns `{ cancel }` |

## Unhandled rejections

A rejection with no handler attached by the next tick is reported: every `onPossiblyUnhandledException` handler is called, once per error, and the error is then thrown from a timer so it reaches `window.onerror` or the process the way an uncaught exception would. `lazy()` and `asyncReject` opt a promise out.

## Windows

`isPromise` never reads `then` off a window. A page can define `window.then`, and reading any property of a cross-origin window throws, so windows are ruled out before the check, which is what lets a window be passed through a promise chain safely.

## Changes in 3.0

Published as `zalgo-promise` again (2.x lived under `@krakenjs`). ES modules and TypeScript only; the CommonJS entry point, the UMD bundle and the Flow types are gone. The `window.constructor` and user-agent checks that existed for old browsers are gone. Behaviour is otherwise the same.

## License

Apache-2.0
