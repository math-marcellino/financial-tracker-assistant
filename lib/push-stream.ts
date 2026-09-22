/**
 * A queue-backed AsyncIterable you can push into.
 *
 * ResponseStream consumes an AsyncIterable<string>; our SSE reader produces callbacks.
 * This bridges the two so the component renders the *actual* tokens as they arrive,
 * rather than replaying a finished string as a fake typewriter.
 */
export type PushStream = {
  iterable: AsyncIterable<string>;
  push: (chunk: string) => void;
  close: () => void;
};

export const createPushStream = (): PushStream => {
  const queue: string[] = [];
  let resolveNext: (() => void) | null = null;
  let closed = false;

  const wake = () => {
    resolveNext?.();
    resolveNext = null;
  };

  const iterable: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (queue.length > 0) {
          yield queue.shift() as string;
          continue;
        }

        if (closed) return;

        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    },
  };

  return {
    iterable,
    push: (chunk: string) => {
      queue.push(chunk);
      wake();
    },
    close: () => {
      closed = true;
      wake();
    },
  };
};
