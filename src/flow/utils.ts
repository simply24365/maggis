export function deepMerge<T extends Record<string, any>>(from: Partial<T>, to: T): T {
  // Handle null or undefined cases
  if (!from) return to;
  if (!to) return from as T;

  // Create a new object to avoid modifying the original
  const result = { ...to };

  for (const key in from) {
    if (Object.prototype.hasOwnProperty.call(from, key)) {
      const fromValue = from[key];
      const toValue = to[key];

      // Handle array case
      if (Array.isArray(fromValue)) {
        result[key] = fromValue.slice();
        continue;
      }

      // Handle object case
      if (fromValue && typeof fromValue === 'object') {
        result[key] = deepMerge(fromValue, toValue || {}) as T[Extract<keyof T, string>];
        continue;
      }

      // Handle primitive values
      if (fromValue !== undefined) {
        result[key] = fromValue;
      }
    }
  }

  return result;
}




/**
 * Calculates a specific quantile from a sorted array of numbers.
 * @param sortedArr - A pre-sorted array of numbers.
 * @param q - The quantile to calculate (e.g., 0.25 for the 25th percentile).
 * @returns The value at the specified quantile.
 */
export function getQuantile(sortedArr: number[], q: number): number {
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  } else {
    return sortedArr[base];
  }
}
