import { showConfirmDialog } from 'vant';
import type { Router } from 'vue-router';

type VersionManifest = {
  app?: string;
  version?: string;
  buildId?: string;
  builtAt?: string;
};

const CHECK_INTERVAL_MS = 60_000;
const PROMPT_SNOOZE_MS = 5 * 60_000;
const CURRENT_BUILD_ID = __QANDA_BUILD_ID__;

function versionUrl() {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}version.json`;
}

async function fetchLatestVersion() {
  const url = `${versionUrl()}?t=${Date.now()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  });

  if (!response.ok) return null;
  return await response.json() as VersionManifest;
}

function reloadForLatestVersion() {
  window.location.reload();
}

export function startVersionUpdateChecker(router?: Router) {
  if (!import.meta.env.PROD || typeof window === 'undefined') return;

  let timer: number | undefined;
  let checking = false;
  let promptOpen = false;
  let snoozedUntil = 0;
  let pendingLatest: VersionManifest | null = null;
  let removeRouteHook: (() => void) | undefined;

  function isPracticeRoute() {
    const route = router?.currentRoute.value;
    return route?.name === 'practice' || window.location.pathname.startsWith('/practice/');
  }

  function canPromptForUpdate() {
    return document.visibilityState === 'visible' && !isPracticeRoute();
  }

  async function promptPendingUpdate() {
    if (!pendingLatest || promptOpen || Date.now() < snoozedUntil || !canPromptForUpdate()) return;

    promptOpen = true;
    try {
      await showConfirmDialog({
        title: '发现新版本',
        message: '题库和页面功能已更新，刷新后即可使用最新版本。',
        confirmButtonText: '立即更新',
        cancelButtonText: '稍后',
        closeOnClickOverlay: false
      });
      reloadForLatestVersion();
    } catch {
      snoozedUntil = Date.now() + PROMPT_SNOOZE_MS;
    } finally {
      promptOpen = false;
    }
  }

  async function checkForUpdate() {
    if (checking || promptOpen || Date.now() < snoozedUntil) return;
    checking = true;

    try {
      const latest = await fetchLatestVersion();
      const latestBuildId = String(latest?.buildId || '');
      if (!latestBuildId || latestBuildId === CURRENT_BUILD_ID) return;
      pendingLatest = latest;
      await promptPendingUpdate();
    } catch {
      // 静默失败：网络恢复或下次唤醒页面时会再次检查。
    } finally {
      checking = false;
    }
  }

  function checkWhenVisible() {
    if (document.visibilityState !== 'visible') return;
    if (pendingLatest) void promptPendingUpdate();
    else void checkForUpdate();
  }

  timer = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
  window.setTimeout(() => void checkForUpdate(), 5_000);
  window.addEventListener('focus', checkWhenVisible);
  document.addEventListener('visibilitychange', checkWhenVisible);
  removeRouteHook = router?.afterEach(() => {
    if (pendingLatest) void promptPendingUpdate();
  });

  window.addEventListener('beforeunload', () => {
    if (timer) window.clearInterval(timer);
    removeRouteHook?.();
    window.removeEventListener('focus', checkWhenVisible);
    document.removeEventListener('visibilitychange', checkWhenVisible);
  }, { once: true });
}
