/** Wall clock (non-monotonic). Use from non-React modules or event handlers to satisfy react-hooks/purity. */
export function wallTimeMs(): number {
  return Date.now();
}
