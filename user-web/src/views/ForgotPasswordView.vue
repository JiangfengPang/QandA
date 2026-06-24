<template>
  <section class="auth-screen">
    <div class="auth-hero">
      <img src="/qanda-logo.png" class="auth-logo" alt="QandA" />
      <h1>找回密码</h1>
    </div>

    <van-form class="auth-form" @submit="submitReset">
      <van-cell-group inset>
        <van-field v-model="email" name="email" label="账号" placeholder="QQ 邮箱" autocomplete="email" :rules="[{ required: true, message: '请输入 QQ 邮箱' }]" />
        <van-field v-model="code" name="code" label="验证码" placeholder="请输入验证码" maxlength="12">
          <template #button>
            <van-button size="small" type="primary" native-type="button" :disabled="codeLeft > 0" :loading="sending" @click="sendCode">
              {{ codeLeft > 0 ? `${codeLeft}s` : '发送验证码' }}
            </van-button>
          </template>
        </van-field>
        <van-field
          v-model="newPassword"
          name="newPassword"
          label="新密码"
          placeholder="至少 12 位，至少包含三类字符"
          :type="showNewPassword ? 'text' : 'password'"
          autocomplete="new-password"
        >
          <template #right-icon>
            <button class="qx-field-icon-btn" type="button" :aria-label="showNewPassword ? '隐藏新密码' : '显示新密码'" @click.stop="showNewPassword = !showNewPassword">
              <QxIcon :name="showNewPassword ? 'eye' : 'eye-off'" tone="slate" />
            </button>
          </template>
        </van-field>
        <van-field
          v-model="confirmPassword"
          name="confirmPassword"
          label="确认密码"
          placeholder="请再次输入新密码"
          :type="showConfirmPassword ? 'text' : 'password'"
          autocomplete="new-password"
        >
          <template #right-icon>
            <button class="qx-field-icon-btn" type="button" :aria-label="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'" @click.stop="showConfirmPassword = !showConfirmPassword">
              <QxIcon :name="showConfirmPassword ? 'eye' : 'eye-off'" tone="slate" />
            </button>
          </template>
        </van-field>
      </van-cell-group>

      <div class="auth-submit">
        <van-button block round type="primary" native-type="submit" :loading="loading">重置密码</van-button>
      </div>
    </van-form>

    <p class="auth-switch">想起来了？<RouterLink to="/login">返回登录</RouterLink></p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { api } from '../api/request';
import QxIcon from '../components/QxIcon.vue';

const router = useRouter();
const email = ref('');
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);
const loading = ref(false);
const sending = ref(false);
const codeLeft = ref(0);
let timer: number | undefined;

function isQqEmail(value: string) {
  return /^[1-9]\d{4,11}@qq\.com$/i.test(value.trim());
}

function passwordPolicyMessage(value: string) {
  if (value.length < 12) return '新密码至少 12 位';
  const types = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  if (types < 3) return '新密码需包含大写字母、小写字母、数字、特殊字符中的至少三类';
  return '';
}

function startCountdown(seconds = 60) {
  codeLeft.value = seconds;
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(() => {
    codeLeft.value -= 1;
    if (codeLeft.value <= 0 && timer) {
      window.clearInterval(timer);
      timer = undefined;
    }
  }, 1000);
}

async function sendCode() {
  const emailValue = email.value.trim();
  if (!isQqEmail(emailValue)) {
    showToast('请输入正确的 QQ 邮箱');
    return;
  }

  sending.value = true;
  try {
    const data = await api.post<{ sent: boolean; devCode?: string; message?: string }>('/auth/password-reset/request', { account: emailValue });
    showToast(data.message || '验证码已发送');
    if (data.devCode) showToast(`开发验证码：${data.devCode}`);
    startCountdown();
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '验证码发送失败' });
  } finally {
    sending.value = false;
  }
}

async function submitReset() {
  const emailValue = email.value.trim();
  if (!isQqEmail(emailValue)) return showToast('请输入正确的 QQ 邮箱');
  if (!code.value.trim()) return showToast('请输入验证码');

  const passwordMessage = passwordPolicyMessage(newPassword.value);
  if (passwordMessage) return showToast(passwordMessage);
  if (newPassword.value !== confirmPassword.value) return showToast('两次输入的新密码不一致');

  loading.value = true;
  try {
    await api.post('/auth/password-reset/confirm', {
      account: emailValue,
      code: code.value.trim(),
      newPassword: newPassword.value
    });
    showToast({ type: 'success', message: '密码已重置，请重新登录' });
    router.replace('/login');
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '密码重置失败' });
  } finally {
    loading.value = false;
  }
}

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>
