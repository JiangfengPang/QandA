export function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dayLabel(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

export function sumRecordedDurationSeconds(records: Array<{ durationSeconds?: number | null }>) {
  return records.reduce((sum, record) => {
    const value = Number(record.durationSeconds || 0);
    if (!Number.isFinite(value) || value <= 0) return sum;
    return sum + Math.floor(value);
  }, 0);
}
