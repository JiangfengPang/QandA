import { onBeforeUnmount, onMounted } from 'vue';

const VIEWPORT_HEIGHT_VAR = '--practice-vvh';

function resolveViewportHeight() {
  if (typeof window === 'undefined') return 0;
  return window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
}

function writeViewportHeight() {
  const height = resolveViewportHeight();
  if (height > 0) {
    document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${Math.round(height)}px`);
  }
}

function clearViewportHeight() {
  document.documentElement.style.removeProperty(VIEWPORT_HEIGHT_VAR);
}

export function useVisualViewportHeight() {
  onMounted(() => {
    writeViewportHeight();
    window.addEventListener('resize', writeViewportHeight, { passive: true });
    window.addEventListener('orientationchange', writeViewportHeight, { passive: true });
    window.visualViewport?.addEventListener('resize', writeViewportHeight, { passive: true });
    window.visualViewport?.addEventListener('scroll', writeViewportHeight, { passive: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', writeViewportHeight);
    window.removeEventListener('orientationchange', writeViewportHeight);
    window.visualViewport?.removeEventListener('resize', writeViewportHeight);
    window.visualViewport?.removeEventListener('scroll', writeViewportHeight);
    clearViewportHeight();
  });
}
