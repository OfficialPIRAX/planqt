/**
 * German locale formatters for Flora-Pi.
 *
 * All functions accept ISO date strings or numbers and produce
 * human-friendly German output.
 */

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
});

const numberFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1,
});

const relativeFormatter = new Intl.RelativeTimeFormat('de-DE', {
  numeric: 'auto',
  style: 'narrow',
});

/* ----------------------------------------------------------------
   Public helpers
   ---------------------------------------------------------------- */

/** "7. Mai 2026" */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** "14:30" */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/**
 * "vor 3 Min." / "vor 2 Std." / "gestern"
 *
 * Uses Intl.RelativeTimeFormat with narrow style for compact display.
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = then - now;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffMs / 60_000);
  const diffHr = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);

  if (Math.abs(diffSec) < 60) {
    return relativeFormatter.format(diffSec, 'second');
  }
  if (Math.abs(diffMin) < 60) {
    return relativeFormatter.format(diffMin, 'minute');
  }
  if (Math.abs(diffHr) < 24) {
    return relativeFormatter.format(diffHr, 'hour');
  }
  return relativeFormatter.format(diffDay, 'day');
}

/** "1.234,5" */
export function formatNumber(n: number): string {
  return numberFormatter.format(n);
}

/** "250 ml" or "1,2 L" */
export function formatMl(ml: number): string {
  if (ml >= 1000) {
    return `${numberFormatter.format(ml / 1000)} L`;
  }
  return `${Math.round(ml)} ml`;
}
