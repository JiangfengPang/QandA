function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env || {};

export const DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS = parsePositiveInt(
  viteEnv.VITE_PRESENCE_HEARTBEAT_INTERVAL_MS,
  120000
);
export const DEFAULT_PRESENCE_HIDDEN_HEARTBEAT_INTERVAL_MS = parsePositiveInt(
  viteEnv.VITE_PRESENCE_HIDDEN_HEARTBEAT_INTERVAL_MS,
  300000
);
