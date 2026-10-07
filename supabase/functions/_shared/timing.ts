// Step timings for a request, returned to the app as `timings` (milliseconds) so
// slow steps can be measured on the device and by scripts/bench.mjs.
export function startTimer() {
  const start = performance.now();
  let last = start;
  const marks: Record<string, number> = {};
  return {
    // Records the time since the previous mark under `name` (adds up if repeated).
    mark(name: string) {
      const now = performance.now();
      marks[name] = (marks[name] ?? 0) + Math.round(now - last);
      last = now;
    },
    // Adds a measurement taken elsewhere, e.g. model time inside generateReply.
    add(name: string, ms: number) {
      marks[name] = (marks[name] ?? 0) + Math.round(ms);
    },
    done(): Record<string, number> {
      return { ...marks, total: Math.round(performance.now() - start) };
    },
  };
}
