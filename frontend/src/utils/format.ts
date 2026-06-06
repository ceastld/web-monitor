const ISO_TZ_SUFFIX = /(?:[zZ]|[+-]\d{2}:\d{2})$/;

/** Parse API datetimes; naive ISO strings are treated as UTC. */
export function parseApiDate(value: string): Date {
  const trimmed = value.trim();
  if (ISO_TZ_SUFFIX.test(trimmed)) {
    return new Date(trimmed);
  }
  return new Date(`${trimmed}Z`);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "尚未抓取";

  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
}
