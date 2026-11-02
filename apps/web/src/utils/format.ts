/** Shared display helpers for the web app. */
export function formatMetric(value: unknown, digits = 3): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}
