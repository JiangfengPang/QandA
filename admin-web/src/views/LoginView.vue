<template>
  <div class="login-page" @pointermove="updateLoginPointer" @pointerleave="resetLoginPointer">
    <AuthParticleBackground variant="admin" />
    <el-card class="login-card">
      <div class="login-brand"><img src="/qanda-logo.png" /><h1>管理端登录</h1></div>
      <el-form class="login-form" @submit.prevent>
        <el-form-item class="login-form-item"><el-input v-model="username" placeholder="管理员账号" /></el-form-item>
        <el-form-item class="login-form-item"><el-input v-model="password" placeholder="密码" type="password" show-password /></el-form-item>
        <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="submit">登录</el-button>
      </el-form>
      <p class="hint">生产环境请使用你在 server/.env 中配置的管理员账号。登录接口已启用限流保护。</p>
    </el-card>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import AuthParticleBackground from '../components/AuthParticleBackground.vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
const username = ref('');
const password = ref('');
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();
function setLoginPointer(x = '50%', y = '32%') {
  document.documentElement.style.setProperty('--admin-login-x', x);
  document.documentElement.style.setProperty('--admin-login-y', y);
}
function updateLoginPointer(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = `${Math.round(((event.clientX - rect.left) / rect.width) * 100)}%`;
  const y = `${Math.round(((event.clientY - rect.top) / rect.height) * 100)}%`;
  setLoginPointer(x, y);
}
function resetLoginPointer() {
  setLoginPointer();
}
async function submit() {
  loading.value = true;
  try { await auth.login(username.value, password.value); router.push('/dashboard'); }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '登录失败'); }
  finally { loading.value = false; }
}
</script>
