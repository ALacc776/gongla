// Cleans up tool input from the model. Pure.

// The model sometimes sends an array parameter as a string of JSON ("[{...}]").
// Returns the array either way, or null if there isn't one.
export function asArray<T>(value: unknown): T[] | null {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}
