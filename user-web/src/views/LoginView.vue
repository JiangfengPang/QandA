<template>
  <section class="auth-screen">
    <div class="auth-hero">
      <img src="/qanda-logo.png" class="auth-logo" alt="QandA" />
      <h1>欢迎回来</h1>
    </div>

    <van-form class="auth-form" @submit="submit">
      <van-cell-group inset>
        <van-field v-model="email" name="email" label="账号" placeholder="QQ 邮箱" autocomplete="email" :rules="[{ required: true, message: '请输入 QQ 邮箱' }]" />
        <van-field
          v-model="password"
          name="password"
          label="密码"
          placeholder="请输入密码"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          :rules="[{ required: true, message: '请输入密码' }]"
        >
          <template #right-icon>
            <button class="qx-field-icon-btn" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click.stop="showPassword = !showPassword">
              <QxIcon :name="showPassword ? 'eye' : 'eye-off'" tone="slate" />
            </button>
          </template>
        </van-field>
      </van-cell-group>
      <div class="auth-submit">
        <van-button block round type="primary" native-type="submit" :loading="loading">登录</van-button>
      </div>
    </van-form>

    <p class="auth-switch">
      <RouterLink to="/forgot-password">忘记密码</RouterLink>
      <span> · </span>
      还没有账号？<RouterLink to="/register">立即注册</RouterLink>
    </p>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import QxIcon from '../components/QxIcon.vue';
import { useAuthStore } from '../stores/auth';
import { isQqEmail } from '../utils/email';

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function submit() {
  const emailValue = email.value.trim();
  if (!isQqEmail(emailValue)) {
    showToast('请输入正确的 QQ 邮箱');
    return;
  }

  loading.value = true;
  try {
    await auth.login(emailValue, password.value);
    showToast({ type: 'success', message: '登录成功' });
    router.push('/');
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '登录失败' });
  } finally {
    loading.value = false;
  }
}
</script>
