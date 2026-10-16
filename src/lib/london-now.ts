// Current Europe/London wall-clock time as "YYYY-MM-DDTHH:MM". Client-safe.
export function londonNow(now = new Date()): string {
  return now
    .toLocaleString('sv-SE', { timeZone: 'Europe/London', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}
