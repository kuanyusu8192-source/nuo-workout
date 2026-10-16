/** 使用者是否要求減少動態（prefers-reduced-motion）。無 matchMedia（如 jsdom）視為不減少。 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
