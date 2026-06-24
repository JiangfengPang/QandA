<template>
  <el-container class="admin-layout">
    <el-aside width="220px" class="admin-sidebar">
      <div class="admin-brand">
        <img src="/qanda-logo.png" alt="QandA" />
        <div>
          <strong>QandA</strong>
          <span>管理系统</span>
        </div>
      </div>

      <el-scrollbar class="admin-menu-wrap">
        <el-menu router :default-active="$route.path" class="admin-menu" background-color="transparent" text-color="#c7d2fe" active-text-color="#ffffff">
          <el-menu-item index="/workspace">
            <el-icon><FolderOpened /></el-icon>
            <span>题库工作台</span>
          </el-menu-item>
          <el-menu-item index="/dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <span>仪表盘</span>
          </el-menu-item>
          <el-menu-item index="/activity">
            <el-icon><TrendCharts /></el-icon>
            <span>活跃度监控</span>
          </el-menu-item>
          <el-menu-item index="/announcements">
            <el-icon><Bell /></el-icon>
            <span>公告管理</span>
          </el-menu-item>
          <el-menu-item index="/users">
            <el-icon><User /></el-icon>
            <span>答题用户</span>
          </el-menu-item>
          <el-menu-item index="/admins">
            <el-icon><User /></el-icon>
            <span>管理员账号</span>
          </el-menu-item>
          <el-menu-item index="/audit-logs">
            <el-icon><Document /></el-icon>
            <span>操作日志</span>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <span>安全设置</span>
          </el-menu-item>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container class="admin-main-shell">
      <el-header class="admin-header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>后台管理</el-breadcrumb-item>
            <el-breadcrumb-item>{{ title }}</el-breadcrumb-item>
          </el-breadcrumb>
          <h1>{{ title }}</h1>
        </div>
        <div class="header-right">
          <el-tag effect="plain" type="warning">生产加固版</el-tag>
          <el-button plain @click="logout">
            <el-icon><SwitchButton /></el-icon>
            退出登录
          </el-button>
        </div>
      </el-header>

      <nav class="admin-mobile-nav" aria-label="管理端导航">
        <RouterLink to="/workspace">题库</RouterLink>
        <RouterLink to="/dashboard">仪表盘</RouterLink>
        <RouterLink to="/activity">活跃度</RouterLink>
        <RouterLink to="/announcements">公告</RouterLink>
        <RouterLink to="/users">用户</RouterLink>
        <RouterLink to="/admins">管理员</RouterLink>
        <RouterLink to="/audit-logs">日志</RouterLink>
        <RouterLink to="/settings">安全</RouterLink>
      </nav>

      <el-main class="admin-content">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bell, DataAnalysis, Document, FolderOpened, Setting, SwitchButton, TrendCharts, User } from '@element-plus/icons-vue';
import { ElBreadcrumb, ElBreadcrumbItem } from 'element-plus/es/components/breadcrumb/index';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElAside, ElContainer, ElHeader, ElMain } from 'element-plus/es/components/container/index';
import { ElIcon } from 'element-plus/es/components/icon/index';
import { ElMenu, ElMenuItem } from 'element-plus/es/components/menu/index';
import { ElScrollbar } from 'element-plus/es/components/scrollbar/index';
import { ElTag } from 'element-plus/es/components/tag/index';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const title = computed(() => String(route.name || '题库工作台'));

async function logout() {
  await auth.logout();
  router.push('/login');
}
</script>
