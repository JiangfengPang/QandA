<template>
  <section class="auth-screen">
    <div class="auth-hero">
      <img src="/qanda-logo.png" class="auth-logo" alt="QandA" />
      <h1>创建账号</h1>
    </div>

    <van-form class="auth-form" @submit="submit">
      <van-cell-group inset>
        <van-field
          v-model="nickname"
          name="nickname"
          label="昵称"
          placeholder="2-16 个字符，不能全是符号"
          autocomplete="nickname"
          maxlength="16"
          :rules="[{ validator: validateNicknameField }]"
        >
          <template #button>
            <van-button size="small" plain type="primary" native-type="button" @click="fillRandomNickname">随机</van-button>
          </template>
        </van-field>
        <van-field v-model="email" name="email" label="QQ 邮箱" placeholder="请输入 QQ 邮箱" autocomplete="email" :rules="[{ required: true, message: '请输入 QQ 邮箱' }]" />
        <van-field v-model="code" name="code" label="验证码" placeholder="请输入验证码" maxlength="12">
          <template #button>
            <van-button size="small" type="primary" native-type="button" :disabled="codeLeft > 0" :loading="sending" @click="sendCode">
              {{ codeLeft > 0 ? `${codeLeft}s` : '发送验证码' }}
            </van-button>
          </template>
        </van-field>
        <van-field
          v-model="password"
          name="password"
          label="密码"
          placeholder="至少 8 位，至少包含三类字符"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="new-password"
          :rules="[{ required: true, message: '请输入密码' }]"
        >
          <template #right-icon>
            <button class="qx-field-icon-btn" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click.stop="showPassword = !showPassword">
              <QxIcon :name="showPassword ? 'eye' : 'eye-off'" tone="slate" />
            </button>
          </template>
        </van-field>
        <van-field
          v-model="confirmPassword"
          name="confirmPassword"
          label="确认密码"
          placeholder="请再次输入密码"
          :type="showConfirmPassword ? 'text' : 'password'"
          autocomplete="new-password"
          :rules="[{ required: true, message: '请再次输入密码' }]"
        >
          <template #right-icon>
            <button class="qx-field-icon-btn" type="button" :aria-label="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'" @click.stop="showConfirmPassword = !showConfirmPassword">
              <QxIcon :name="showConfirmPassword ? 'eye' : 'eye-off'" tone="slate" />
            </button>
          </template>
        </van-field>
      </van-cell-group>
      <div class="auth-submit">
        <van-button block round type="primary" native-type="submit" :loading="loading">注册并登录</van-button>
      </div>
    </van-form>

    <p class="auth-switch">已有账号？<RouterLink to="/login">去登录</RouterLink></p>
  </section>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { api } from '../api/request';
import QxIcon from '../components/QxIcon.vue';
import { useAuthStore } from '../stores/auth';
import { isQqEmail } from '../utils/email';
import { createRandomNickname, nicknamePolicyMessage, normalizeNickname } from '../utils/nicknamePolicy';
import { passwordPolicyMessage } from '../utils/passwordPolicy';

const nickname = ref('');
const email = ref('');
const code = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const loading = ref(false);
const sending = ref(false);
const codeLeft = ref(0);
let timer: number | undefined;

const router = useRouter();
const auth = useAuthStore();

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

function validateNicknameField(value: string) {
  return nicknamePolicyMessage(value) || true;
}

function fillRandomNickname() {
  nickname.value = createRandomNickname();
}

async function sendCode() {
  const emailValue = email.value.trim();
  if (!isQqEmail(emailValue)) {
    showToast('请输入正确的 QQ 邮箱');
    return;
  }
  sending.value = true;
  try {
    const data = await api.post<{ sent: boolean; devCode?: string; message?: string }>('/auth/register/code', { email: emailValue });
    showToast(data.message || '验证码已发送');
    if (data.devCode) showToast(`开发验证码：${data.devCode}`);
    startCountdown();
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '验证码发送失败' });
  } finally {
    sending.value = false;
  }
}

async function submit() {
  const emailValue = email.value.trim();
  const nicknameValue = normalizeNickname(nickname.value);
  const nicknameMessage = nicknamePolicyMessage(nicknameValue);

  if (nicknameMessage) return showToast(nicknameMessage);
  if (!isQqEmail(emailValue)) return showToast('请输入正确的 QQ 邮箱');
  if (!code.value.trim()) return showToast('请输入验证码');

  const passwordMessage = passwordPolicyMessage(password.value);
  if (passwordMessage) return showToast(passwordMessage);
  if (password.value !== confirmPassword.value) return showToast('两次输入的密码不一致');

  loading.value = true;
  try {
    await auth.register({ nickname: nicknameValue, email: emailValue, code: code.value.trim(), password: password.value });
    showToast({ type: 'success', message: '注册成功' });
    router.push('/');
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '注册失败' });
  } finally {
    loading.value = false;
  }
}

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>
