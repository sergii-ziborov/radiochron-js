'use strict';

function assertInterval(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('stream intervalMs must be a non-negative finite number');
  }
  return value;
}

function wait(intervalMs, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  if (intervalMs === 0) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolvePromise(true);
    }, intervalMs);
    function aborted() {
      clearTimeout(timer);
      resolvePromise(false);
    }
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

async function* pollingStream(producer, options = {}) {
  const intervalMs = assertInterval(options.intervalMs ?? 1_000);
  while (!options.signal?.aborted) {
    const value = await producer();
    if (options.signal?.aborted) return;
    yield value;
    if (!await wait(intervalMs, options.signal)) return;
  }
}

async function* chronicleStream(producer, options = {}) {
  const seen = new Set();
  const order = [];
  const maxSeen = Math.max(100, (options.maxEntries ?? 100) * 4);
  let first = true;

  for await (const snapshot of pollingStream(producer, options)) {
    const fresh = [];
    for (const entry of snapshot.entries ?? []) {
      const key = entry.event_id;
      if (typeof key !== 'string' || seen.has(key)) continue;
      seen.add(key);
      order.push(key);
      fresh.push(entry);
    }
    while (order.length > maxSeen) seen.delete(order.shift());
    if (!first || options.includeExisting) {
      for (const entry of fresh) yield entry;
    }
    first = false;
  }
}

module.exports = { chronicleStream, pollingStream };
