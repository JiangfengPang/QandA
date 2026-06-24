export type DateTimeInput = string | number | Date | null | undefined;

const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value || '';
}

export function formatDateTime(value: DateTimeInput, timeZone = DEFAULT_TIME_ZONE) {
  if (value === null || value === undefined || value === '') return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(date);

  const year = readPart(parts, 'year');
  const month = readPart(parts, 'month');
  const day = readPart(parts, 'day');
  const hour = readPart(parts, 'hour');
  const minute = readPart(parts, 'minute');
  const second = readPart(parts, 'second');

  if (!year || !month || !day || !hour || !minute || !second) return '-';
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
