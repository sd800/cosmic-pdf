// Event-driven current-page recognition: one debounce, no page scan or polling.
export function createAutomaticOcr({ currentPage, eligible, hasResult, isBusy, recognize, signal,
  schedule = setTimeout, cancel = clearTimeout }) {
  const empty = new Set(), attempted = new Set(); let timer, disposed = false;
  const valid = page => Number.isInteger(page) && page > 0 && page <= 10000;
  const ready = page => !disposed && !signal.aborted && eligible() && !isBusy() &&
    valid(page) && empty.has(page) && !attempted.has(page) && !hasResult(page);
  function unschedule() { if (timer !== undefined) cancel(timer); timer = undefined; }
  function request() {
    unschedule(); const page = currentPage(); if (!ready(page)) return;
    timer = schedule(() => {
      timer = undefined; if (currentPage() !== page || !ready(page)) return;
      attempted.add(page);
      // Empty/failed/cancelled results are not retried in a loop. The OCR button
      // remains the explicit retry path, and manual runs keep priority.
      void Promise.resolve().then(() => {
        if (!disposed && !signal.aborted && eligible() && !isBusy() && currentPage() === page && empty.has(page) && !hasResult(page)) return recognize(page);
      }).catch(() => {}).finally(request);
    }, 500);
  }
  function manual(from, to = from) {
    unschedule(); if (disposed || !valid(from) || !valid(to)) return;
    for (let page = from; page <= Math.min(to, from + 19); page++) attempted.add(page);
  }
  function destroy() { disposed = true; unschedule(); empty.clear(); attempted.clear(); }
  signal.addEventListener('abort', destroy, { once: true });
  return { request, manual, destroy, evicted(page) {
    // A known successful result removed by the memory budget may be rebuilt
    // when revisited. Explicit Clear and failed/empty attempts do not use this.
    if (!disposed && valid(page)) attempted.delete(page);
  }, observe(page, hasText, failed = false) {
    if (!valid(page) || disposed) return;
    if (hasText || failed) empty.delete(page); else empty.add(page);
    request();
  } };
}
