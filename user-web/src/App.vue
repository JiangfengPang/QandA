<template>
  <div v-if="!isAuthLayout" class="app-frame" :class="appFrameClasses">
    <aside class="app-sidebar">
      <RouterLink to="/me" class="brand">
        <span class="brand-mark is-user-avatar">
          <img v-if="sidebarAvatarSrc" :src="sidebarAvatarSrc" alt="用户头像" @error="sidebarAvatarLoadFailed = true" />
          <b v-else>{{ sidebarAvatarText }}</b>
        </span>
        <div>
          <strong>{{ auth.user?.nickname || '用户' }}</strong>
          <span>{{ sidebarEmailText }}</span>
        </div>
      </RouterLink>

      <nav class="nav-tabs" aria-label="主导航">
        <RouterLink to="/" class="nav-tab" :class="{ active: isRouteActive(['home']) }">
          <span class="nav-icon" aria-hidden="true">
            <QxIcon name="home" />
          </span>
          首页
        </RouterLink>

        <RouterLink to="/library" class="nav-tab" :class="{ active: isRouteActive(['library', 'banks', 'practice', 'memorize']) }">
          <span class="nav-icon" aria-hidden="true">
            <QxIcon name="library" />
          </span>
          题库
        </RouterLink>

        <RouterLink to="/wrongs" class="nav-tab" :class="{ active: isRouteActive(['wrongs', 'favorites']) }">
          <span class="nav-icon" aria-hidden="true">
            <QxIcon name="review" />
          </span>
          复盘
          <span v-if="reviewCount" class="nav-badge">{{ reviewCount }}</span>
        </RouterLink>

        <RouterLink to="/stats" class="nav-tab" :class="{ active: isRouteActive(['stats']) }">
          <span class="nav-icon" aria-hidden="true">
            <QxIcon name="stats" />
          </span>
          统计
        </RouterLink>

        <RouterLink to="/me" class="nav-tab" :class="{ active: isRouteActive(['me']) }">
          <span class="nav-icon" aria-hidden="true">
            <QxIcon name="user" />
          </span>
          我的
        </RouterLink>
      </nav>
    </aside>

    <main class="app-shell">
      <RouterView />
    </main>
  </div>

  <div
    v-else
    class="mobile-app-shell is-auth"
    @pointermove="updateAuthPointer"
    @pointerleave="resetAuthPointer"
  >
    <AuthParticleBackground variant="user" />
    <main class="auth-page">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from './api/request';
import AuthParticleBackground from './components/AuthParticleBackground.vue';
import QxIcon from './components/QxIcon.vue';
import { useAuthStore } from './stores/auth';

const route = useRoute();
const auth = useAuthStore();
const reviewSummary = ref({ wrongQuestionCount: 0, favoriteCount: 0 });
const sidebarAvatarLoadFailed = ref(false);

const layoutName = computed(() => String(route.meta.layout || 'main'));
const isAuthLayout = computed(() => layoutName.value === 'auth');
const isPracticeLayout = computed(() => layoutName.value === 'practice');
const appFrameClasses = computed(() => ({
  [`is-layout-${layoutName.value}`]: true,
  'is-practice-frame': isPracticeLayout.value
}));
const sidebarAvatarText = computed(() => (auth.user?.nickname || 'Q').slice(0, 1).toUpperCase());
const sidebarAvatarSrc = computed(() => {
  const value = auth.user?.avatarUrl || '';
  return value && !sidebarAvatarLoadFailed.value ? value : '';
});
const sidebarEmailText = computed(() => {
  const email = auth.user?.email || '';
  return email ? `邮箱：${maskEmail(email)}` : '邮箱未绑定';
});
const reviewCount = computed(() => Number(reviewSummary.value.wrongQuestionCount || 0));

function isRouteActive(names: string[]) {
  return names.includes(String(route.name));
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}***@${domain}`;
}

function setAuthPointer(x = '50%', y = '28%') {
  document.documentElement.style.setProperty('--auth-pointer-x', x);
  document.documentElement.style.setProperty('--auth-pointer-y', y);
}

function updateAuthPointer(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = `${Math.round(((event.clientX - rect.left) / rect.width) * 100)}%`;
  const y = `${Math.round(((event.clientY - rect.top) / rect.height) * 100)}%`;
  setAuthPointer(x, y);
}

function resetAuthPointer() {
  setAuthPointer();
}

async function refreshReviewSummary() {
  if (isAuthLayout.value) return;
  try {
    reviewSummary.value = await api.get('/practice/review-summary');
  } catch {
    reviewSummary.value = { wrongQuestionCount: 0, favoriteCount: 0 };
  }
}

watch(() => route.fullPath, refreshReviewSummary);
watch(() => auth.user?.avatarUrl, () => {
  sidebarAvatarLoadFailed.value = false;
});
onMounted(() => {
  setAuthPointer();
  refreshReviewSummary();
  window.addEventListener('qanda:stats-updated', refreshReviewSummary);
});

onBeforeUnmount(() => {
  window.removeEventListener('qanda:stats-updated', refreshReviewSummary);
});
</script>
