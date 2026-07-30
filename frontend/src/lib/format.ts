export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const totalMinutes = Math.round(abs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = then - now.getTime();
  if (diff >= 0) {
    return `in ${formatDuration(diff)}`;
  }
  return `${formatDuration(diff)} ago`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
