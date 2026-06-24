export function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!safeSeconds) return '0秒';

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const sec = safeSeconds % 60;

  if (hours) return `${hours}时${minutes}分`;
  if (minutes) return `${minutes}分${sec}秒`;
  return `${sec}秒`;
}
