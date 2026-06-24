import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { getToken } from '../api/request';
import { useAuthStore } from '../stores/auth';

const AUTH_ROUTE_NAMES = ['login', 'register', 'forgot-password'];

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', meta: { layout: 'auth' }, component: () => import('../views/LoginView.vue') },
  { path: '/register', name: 'register', meta: { layout: 'auth' }, component: () => import('../views/RegisterView.vue') },
  { path: '/forgot-password', name: 'forgot-password', meta: { layout: 'auth' }, component: () => import('../views/ForgotPasswordView.vue') },
  { path: '/', name: 'home', meta: { layout: 'main' }, component: () => import('../views/HomeView.vue') },
  { path: '/announcements', name: 'announcements', meta: { layout: 'main' }, component: () => import('../views/AnnouncementView.vue') },
  { path: '/library', name: 'library', meta: { layout: 'main' }, component: () => import('../views/LibraryView.vue') },
  { path: '/subjects/:subjectId/banks', name: 'banks', meta: { layout: 'main' }, component: () => import('../views/LibraryView.vue') },
  { path: '/memorize/:subjectId', name: 'memorize', meta: { layout: 'practice' }, component: () => import('../views/MemorizeView.vue') },
  { path: '/practice/:bankId', name: 'practice', meta: { layout: 'practice' }, component: () => import('../views/PracticeView.vue') },
  { path: '/wrongs', name: 'wrongs', meta: { layout: 'main' }, component: () => import('../views/ReviewView.vue') },
  { path: '/favorites', name: 'favorites', meta: { layout: 'main' }, component: () => import('../views/ReviewView.vue') },
  { path: '/stats', name: 'stats', meta: { layout: 'main' }, component: () => import('../views/StatsView.vue') },
  { path: '/me', name: 'me', meta: { layout: 'main' }, component: () => import('../views/MyView.vue') }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  if (AUTH_ROUTE_NAMES.includes(String(to.name))) return true;
  if (!getToken()) return { name: 'login' };

  const auth = useAuthStore();
  if (!auth.user) {
    try {
      await auth.fetchMe();
    } catch {
      auth.logout();
      return { name: 'login' };
    }
  }

  return true;
});

export default router;
