/** Join conditional class names. Small enough not to warrant a dependency. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/** Two-letter monogram for avatars: "Dharanish Kumar" → "DK". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}`.toUpperCase();
}

/** First name only, for conversational copy ("Shared with Alex"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Collapse whitespace and cap length — applied to every free-text field. */
export function normaliseText(value: string, maxLength = 200): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/** Stable, collision-resistant id for client-only concerns (toasts, keys). */
export function clientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
  };
  return wrapped;
}

/** Case/diacritic-insensitive substring test used by client-side filtering. */
export function matchesQuery(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const normalise = (value: string) =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return normalise(haystack).includes(normalise(needle));
}
