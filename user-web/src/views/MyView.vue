<template>
  <section class="qmine-page">
    <section class="qmine-profile-hero" :style="profileHeroStyle">
      <div class="qmine-profile-main">
        <button class="qmine-avatar" type="button" title="更改头像" @click="openProfileDialog">
          <img v-if="mineAvatarSrc" :src="mineAvatarSrc" alt="用户头像" @error="mineAvatarLoadFailed = true" />
          <span v-else>{{ avatarText }}</span>
        </button>
        <div>
          <h2>{{ auth.user?.nickname || '用户' }}</h2>
          <p>注册时间：{{ createdDate }}</p>
          <span class="qmine-email-pill" :class="{ bound: Boolean(auth.user?.email) }">
            <QxIcon :name="auth.user?.email ? 'mail' : 'warning'" :tone="auth.user?.email ? 'green' : 'orange'" />{{ auth.user?.email ? maskedEmail : '邮箱未绑定' }}
          </span>
        </div>
      </div>
      <button class="qmine-edit-btn" type="button" @click="openProfileDialog">编辑资料</button>
    </section>

    <section class="qmine-grid">
      <article class="qmine-panel qmine-system-panel">
        <div class="qmine-panel-head">
          <div>
            <h2>系统信息</h2>
            <p>页面版本与项目说明。</p>
          </div>
        </div>

        <button class="qmine-row" type="button">
          <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="version" /></span>
          <span>
            <span class="qmine-row-title">版本信息</span>
            <span class="qmine-row-desc">当前前端页面原型</span>
          </span>
          <span class="qmine-version">QandA v{{ displayAppVersion }}</span>
        </button>

        <button class="qmine-row" type="button" @click="showAbout = true">
          <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="info" /></span>
          <span>
            <span class="qmine-row-title">关于项目</span>
            <span class="qmine-row-desc">题库练习与个人刷题系统</span>
          </span>
          <span class="qmine-row-action" aria-hidden="true"><QxIcon name="chevron-right" /></span>
        </button>
      </article>

      <article class="qmine-panel qmine-security-panel">
        <div class="qmine-panel-head">
          <div>
            <h2>账号安全</h2>
            <p>管理登录密码、邮箱绑定和当前登录状态。</p>
          </div>
          <span class="qmine-tag">安全中心</span>
        </div>

        <button class="qmine-row" type="button" @click="openPasswordDialog">
          <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="lock" /></span>
          <span>
            <span class="qmine-row-title">修改密码</span>
            <span class="qmine-row-desc">需要 QQ 邮箱验证码</span>
          </span>
          <span class="qmine-row-action" aria-hidden="true"><QxIcon name="chevron-right" /></span>
        </button>

        <button class="qmine-row" type="button" @click="openEmailDialog">
          <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="mail" /></span>
          <span>
            <span class="qmine-row-title">{{ auth.user?.email ? '更换邮箱' : '绑定邮箱' }}</span>
            <span class="qmine-row-desc">更换时需验证旧邮箱和新邮箱</span>
          </span>
          <span class="qmine-row-action">
            <span class="qmine-mini-tag" :class="{ warn: !auth.user?.email }">{{ auth.user?.email ? '已绑定' : '未绑定' }}</span>
            <QxIcon name="chevron-right" />
          </span>
        </button>

        <button class="qmine-row qmine-danger-row" type="button" @click="handleLogout">
          <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="logout" tone="red" /></span>
          <span>
            <span class="qmine-row-title">退出登录</span>
            <span class="qmine-row-desc">退出当前账号并回到登录页</span>
          </span>
          <span class="qmine-row-action" aria-hidden="true"><QxIcon name="chevron-right" tone="red" /></span>
        </button>
      </article>

      <article class="qmine-panel qmine-prefs-panel">
        <div class="qmine-panel-head">
          <div>
            <h2>使用偏好</h2>
            <p>只保留影响刷题体验的个人设置。</p>
          </div>
          <span class="qmine-tag">个人设置</span>
        </div>

        <div class="qmine-prefs-grid">
          <button class="qmine-row" type="button" @click="togglePreference('autoShowExplanation')">
            <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="analysis" /></span>
            <span>
              <span class="qmine-row-title">答题后自动显示解析</span>
              <span class="qmine-row-desc">提交答案后直接展开解析</span>
            </span>
            <span class="qmine-switch" :class="{ on: preferences.autoShowExplanation }"></span>
          </button>

          <button class="qmine-row" type="button" @click="togglePreference('autoAddWrong')">
            <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="x-circle" tone="red" /></span>
            <span>
              <span class="qmine-row-title">答错自动加入错题</span>
              <span class="qmine-row-desc">方便后续在复盘页集中练习</span>
            </span>
            <span class="qmine-switch" :class="{ on: preferences.autoAddWrong }"></span>
          </button>

          <button class="qmine-row" type="button" @click="togglePreference('autoAdvanceOnCorrect')">
            <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="practice" tone="green" /></span>
            <span>
              <span class="qmine-row-title">答对自动下一题</span>
              <span class="qmine-row-desc">答对后短暂停留并进入下一题</span>
            </span>
            <span class="qmine-switch" :class="{ on: preferences.autoAdvanceOnCorrect }"></span>
          </button>

          <button class="qmine-row" type="button" @click="showFontDialog = true">
            <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="font" tone="purple" /></span>
            <span>
              <span class="qmine-row-title">题目字号</span>
              <span class="qmine-row-desc">标准 / 大字号可在后续切换</span>
            </span>
            <span class="qmine-select-pill">{{ fontSizeText }}</span>
          </button>

          <button class="qmine-row" type="button" @click="togglePreference('showQuestionOverview')">
            <span class="qmine-row-icon" aria-hidden="true"><QxIcon name="overview" /></span>
            <span>
              <span class="qmine-row-title">练习页显示答题卡</span>
              <span class="qmine-row-desc">移动端可通过顶部按钮打开</span>
            </span>
            <span class="qmine-switch" :class="{ on: preferences.showQuestionOverview }"></span>
          </button>
        </div>
      </article>
    </section>

    <p class="qmine-note">我的页面已接入账号资料、头像、邮箱、密码和偏好设置。</p>

    <van-dialog v-model:show="showProfileDialog" title="编辑资料" show-cancel-button :before-close="beforeProfileClose">
      <div class="qmine-dialog-body">
        <div class="qmine-avatar-editor">
          <div class="qmine-avatar-preview">
            <img v-if="profilePreviewAvatarSrc" :src="profilePreviewAvatarSrc" alt="头像预览" @error="profilePreviewAvatarLoadFailed = true" />
            <span v-else>{{ profilePreviewText }}</span>
          </div>
          <div class="qmine-avatar-editor-actions">
            <button type="button" @click="chooseAvatar">更改头像</button>
            <button type="button" class="ghost" @click="removeAvatar">恢复默认</button>
            <p>支持 JPG、PNG、WEBP，会自动压缩后保存。</p>
          </div>
          <input ref="avatarInput" class="qmine-avatar-file" type="file" accept="image/png,image/jpeg,image/webp" @change="handleAvatarChange" />
        </div>
        <van-field v-model="profileForm.nickname" label="昵称" placeholder="请输入昵称">
          <template #right-icon>
            <button class="qx-field-icon-btn" type="button" aria-label="清空昵称" @click.stop="profileForm.nickname = ''">
              <QxIcon name="clear" tone="slate" />
            </button>
          </template>
        </van-field>
      </div>
    </van-dialog>

    <van-dialog
      v-model:show="showEmailDialog"
      class-name="qmine-email-dialog"
      close-on-click-overlay
      :title="emailStep === 'view' ? '设置邮箱' : '修改邮箱'"
      :show-cancel-button="true"
      :show-confirm-button="emailStep === 'edit'"
      confirm-button-text="确认修改"
      cancel-button-text="取消"
      :before-close="beforeEmailClose"
    >
      <div class="qmine-dialog-body qmine-email-dialog-body">
        <template v-if="emailStep === 'view'">
          <div class="qmine-email-current-card">
            <span class="qmine-email-current-label">当前邮箱</span>
            <strong>{{ auth.user?.email ? maskedEmail : '未设置邮箱' }}</strong>
          </div>
          <button class="qmine-email-change-btn" type="button" @click="enterEmailEdit">
            {{ auth.user?.email ? '修改邮箱地址' : '设置邮箱地址' }}
          </button>
        </template>

        <template v-else>
          <van-field
            v-if="auth.user?.email"
            class="qmine-email-field"
            v-model="emailForm.oldCode"
            label="当前邮箱验证码"
            placeholder="请输入验证码"
            maxlength="12"
          >
            <template #button>
              <van-button size="small" type="primary" native-type="button" :disabled="currentEmailLeft > 0" :loading="sendingCurrentEmail" @click="sendCurrentEmailCode">
                {{ currentEmailLeft > 0 ? `${currentEmailLeft}s` : '发送验证码' }}
              </van-button>
            </template>
          </van-field>
          <van-field class="qmine-email-field" v-model="emailForm.email" label="QQ 邮箱" placeholder="请输入 QQ 邮箱" type="email" />
          <van-field class="qmine-email-field" v-model="emailForm.newCode" label="新邮箱验证码" placeholder="请输入验证码" maxlength="12">
            <template #button>
              <van-button size="small" type="primary" native-type="button" :disabled="newEmailLeft > 0" :loading="sendingNewEmail" @click="sendNewEmailCode">
                {{ newEmailLeft > 0 ? `${newEmailLeft}s` : '发送验证码' }}
              </van-button>
            </template>
          </van-field>
        </template>
      </div>
    </van-dialog>

    <van-dialog
      v-model:show="showPasswordDialog"
      class-name="qmine-password-dialog"
      title="修改密码"
      show-cancel-button
      :confirm-button-text="passwordStep === 'verify' ? '下一步' : '确认'"
      :before-close="beforePasswordClose"
    >
      <div class="qmine-dialog-body qmine-password-dialog-body">
        <template v-if="passwordStep === 'verify'">
          <van-field class="qmine-password-field" v-model="passwordForm.code" label="邮箱验证码" placeholder="请输入验证码" maxlength="12">
            <template #button>
              <van-button size="small" type="primary" native-type="button" :disabled="passwordCodeLeft > 0" :loading="sendingPasswordCode" @click="sendPasswordCode">
                {{ passwordCodeLeft > 0 ? `${passwordCodeLeft}s` : '发送验证码' }}
              </van-button>
            </template>
          </van-field>
        </template>
        <template v-else>
          <van-field
            class="qmine-password-field"
            v-model="passwordForm.newPassword"
            label="新密码"
            placeholder="至少 12 位，至少包含三类字符"
            :type="showMineNewPassword ? 'text' : 'password'"
            autocomplete="new-password"
          >
            <template #right-icon>
              <button class="qx-field-icon-btn" type="button" :aria-label="showMineNewPassword ? '隐藏新密码' : '显示新密码'" @click.stop="showMineNewPassword = !showMineNewPassword">
                <QxIcon :name="showMineNewPassword ? 'eye' : 'eye-off'" tone="slate" />
              </button>
            </template>
          </van-field>
          <van-field
            class="qmine-password-field"
            v-model="passwordForm.confirmPassword"
            label="确认密码"
            placeholder="请再次输入新密码"
            :type="showMineConfirmPassword ? 'text' : 'password'"
            autocomplete="new-password"
          >
            <template #right-icon>
              <button class="qx-field-icon-btn" type="button" :aria-label="showMineConfirmPassword ? '隐藏确认密码' : '显示确认密码'" @click.stop="showMineConfirmPassword = !showMineConfirmPassword">
                <QxIcon :name="showMineConfirmPassword ? 'eye' : 'eye-off'" tone="slate" />
              </button>
            </template>
          </van-field>
        </template>
      </div>
    </van-dialog>

    <van-dialog v-model:show="showFontDialog" title="题目字号" :show-confirm-button="false" close-on-click-overlay>
      <div class="qmine-font-options">
        <button v-for="item in fontOptions" :key="item.value" type="button" :class="{ active: preferences.questionFontSize === item.value }" @click="setFontSize(item.value)">
          <strong>{{ item.label }}</strong>
          <span>{{ item.desc }}</span>
        </button>
      </div>
    </van-dialog>

    <van-dialog v-model:show="showAbout" title="关于项目" confirm-button-text="知道了">
      <div class="qmine-dialog-body qmine-about-text">
        <p>QandA 是面向课程复习和题库训练的刷题系统，支持多用户登录、题库练习、错题复盘、收藏、学习统计和公告通知。</p>
        <p>系统会记录答题进度、正确率和薄弱单元，帮助用户在手机与桌面端持续练习，也方便管理员统一维护题库、公告和账号安全。</p>
      </div>
    </van-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { api } from '../api/request';
import QxIcon from '../components/QxIcon.vue';
import { useAuthStore, type UserPreferences } from '../stores/auth';
import '../styles/mine.css';

const router = useRouter();
const auth = useAuthStore();
const avatarInput = ref<HTMLInputElement | null>(null);
const mineAvatarLoadFailed = ref(false);
const profilePreviewAvatarLoadFailed = ref(false);
const showProfileDialog = ref(false);
const showEmailDialog = ref(false);
const showPasswordDialog = ref(false);
const showFontDialog = ref(false);
const showAbout = ref(false);

const profileForm = reactive({ nickname: '', avatarUrl: '' });
const emailForm = reactive({ email: '', oldCode: '', newCode: '' });
const emailStep = ref<'view' | 'edit'>('view');
const passwordForm = reactive({ code: '', newPassword: '', confirmPassword: '' });
const passwordStep = ref<'verify' | 'reset'>('verify');
const showMineNewPassword = ref(false);
const showMineConfirmPassword = ref(false);

const sendingPasswordCode = ref(false);
const sendingCurrentEmail = ref(false);
const sendingNewEmail = ref(false);
const passwordCodeLeft = ref(0);
const currentEmailLeft = ref(0);
const newEmailLeft = ref(0);
const timers: number[] = [];

const fontOptions: Array<{ value: UserPreferences['questionFontSize']; label: string; desc: string }> = [
  { value: 'small', label: '小', desc: '适合一屏显示更多内容' },
  { value: 'standard', label: '标准', desc: '默认阅读尺寸' },
  { value: 'large', label: '大', desc: '更适合长时间阅读' }
];

const preferences = computed(() => auth.user?.preferences || {
  autoShowExplanation: true,
  autoAddWrong: true,
  autoAdvanceOnCorrect: true,
  questionFontSize: 'standard',
  showQuestionOverview: true
});

const avatarText = computed(() => (auth.user?.nickname || 'Q').slice(0, 1).toUpperCase());
const mineAvatarSrc = computed(() => {
  const value = auth.user?.avatarUrl || '';
  return value && !mineAvatarLoadFailed.value ? value : '';
});
const profilePreviewText = computed(() => (profileForm.nickname || auth.user?.nickname || 'Q').slice(0, 1).toUpperCase());
const profilePreviewAvatarSrc = computed(() => {
  const value = profileForm.avatarUrl || '';
  return value && !profilePreviewAvatarLoadFailed.value ? value : '';
});
const createdDate = computed(() => formatDate(auth.user?.createdAt));
const maskedEmail = computed(() => maskEmail(auth.user?.email || ''));
const fontSizeText = computed(() => fontOptions.find((item) => item.value === preferences.value.questionFontSize)?.label || '标准');
const displayAppVersion = computed(() => formatDisplayVersion(__QANDA_APP_VERSION__));
const profileHeroStyle = computed(() => {
  const avatarUrl = mineAvatarSrc.value;
  if (!avatarUrl) return {};
  return { '--qmine-avatar-bg': `url("${escapeCssUrl(avatarUrl)}")` } as Record<string, string>;
});

onMounted(() => {
  void auth.fetchMe(true).catch(() => undefined);
});

watch(() => auth.user?.avatarUrl, () => {
  mineAvatarLoadFailed.value = false;
});

watch(() => profileForm.avatarUrl, () => {
  profilePreviewAvatarLoadFailed.value = false;
});

onBeforeUnmount(() => {
  timers.forEach((timer) => window.clearInterval(timer));
});

function escapeCssUrl(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayVersion(value: string) {
  const parts = String(value || '').split('.');
  if (parts.length >= 2 && Number(parts[2] || 0) === 0) return `${parts[0]}.${parts[1]}`;
  return value || '2.0';
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const head = name.slice(0, 2);
  return `${head}${name.length > 2 ? '***' : '*'}@${domain}`;
}

function isQqEmail(value: string) {
  return /^[1-9]\d{4,11}@qq\.com$/i.test(value.trim());
}

function passwordPolicyMessage(value: string) {
  if (value.length < 12) return '新密码至少 12 位';
  const types = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  if (types < 3) return '新密码需包含大写字母、小写字母、数字、特殊字符中的至少三类';
  return '';
}

function startCountdown(target: typeof passwordCodeLeft, seconds = 60) {
  target.value = seconds;
  const timer = window.setInterval(() => {
    target.value -= 1;
    if (target.value <= 0) window.clearInterval(timer);
  }, 1000);
  timers.push(timer);
}

function openProfileDialog() {
  profileForm.nickname = auth.user?.nickname || '';
  profileForm.avatarUrl = auth.user?.avatarUrl || '';
  profilePreviewAvatarLoadFailed.value = false;
  showProfileDialog.value = true;
}

function chooseAvatar() {
  avatarInput.value?.click();
}

function removeAvatar() {
  profileForm.avatarUrl = '';
  if (avatarInput.value) avatarInput.value.value = '';
}

async function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    showToast('头像仅支持 JPG、PNG、WEBP');
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('头像不能超过 5MB');
    input.value = '';
    return;
  }
  try {
    profileForm.avatarUrl = await resizeAvatar(file);
  } catch {
    showToast({ type: 'fail', message: '头像处理失败，请换一张图片' });
  } finally {
    input.value = '';
  }
}

function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('image failed'));
      image.onload = () => {
        const size = Math.min(image.width, image.height);
        const sx = Math.floor((image.width - size) / 2);
        const sy = Math.floor((image.height - size) / 2);
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas failed'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function openEmailDialog() {
  emailStep.value = 'view';
  emailForm.email = '';
  emailForm.oldCode = '';
  emailForm.newCode = '';
  showEmailDialog.value = true;
}

function enterEmailEdit() {
  emailStep.value = 'edit';
  emailForm.email = '';
  emailForm.oldCode = '';
  emailForm.newCode = '';
}

function openPasswordDialog() {
  passwordStep.value = 'verify';
  passwordForm.code = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
  showMineNewPassword.value = false;
  showMineConfirmPassword.value = false;
  showPasswordDialog.value = true;
}

async function sendPasswordCode() {
  if (!auth.user?.email) return showToast('请先绑定 QQ 邮箱');
  sendingPasswordCode.value = true;
  try {
    const data = await api.post<{ sent: boolean; devCode?: string; message?: string }>('/auth/password/code');
    showToast(data.message || '验证码已发送');
    if (data.devCode) showToast(`开发验证码：${data.devCode}`);
    startCountdown(passwordCodeLeft);
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '验证码发送失败' });
  } finally {
    sendingPasswordCode.value = false;
  }
}

async function sendNewEmailCode() {
  const email = emailForm.email.trim();
  if (!isQqEmail(email)) return showToast('请输入正确的 QQ 邮箱');
  sendingNewEmail.value = true;
  try {
    const data = await api.post<{ sent: boolean; devCode?: string; message?: string }>('/auth/email/code/new', { email });
    showToast(data.message || '验证码已发送');
    if (data.devCode) showToast(`开发验证码：${data.devCode}`);
    startCountdown(newEmailLeft);
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '验证码发送失败' });
  } finally {
    sendingNewEmail.value = false;
  }
}

async function sendCurrentEmailCode() {
  if (!auth.user?.email) return;
  sendingCurrentEmail.value = true;
  try {
    const data = await api.post<{ sent: boolean; devCode?: string; message?: string }>('/auth/email/code/current');
    showToast(data.message || '验证码已发送');
    if (data.devCode) showToast(`开发验证码：${data.devCode}`);
    startCountdown(currentEmailLeft);
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '验证码发送失败' });
  } finally {
    sendingCurrentEmail.value = false;
  }
}

async function beforeProfileClose(action: string) {
  if (action !== 'confirm') return true;
  const nickname = profileForm.nickname.trim();
  if (!nickname) {
    showToast('请输入昵称');
    return false;
  }
  try {
    await auth.updateProfile({ nickname, avatarUrl: profileForm.avatarUrl || null });
    showToast('资料已更新');
    return true;
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '资料更新失败' });
    return false;
  }
}

async function beforeEmailClose(action: string) {
  if (action !== 'confirm') return true;
  if (emailStep.value === 'view') return true;

  const email = emailForm.email.trim();
  if (!isQqEmail(email)) {
    showToast('请输入正确的 QQ 邮箱');
    return false;
  }
  if (auth.user?.email === email) {
    showToast('新邮箱不能与当前邮箱相同');
    return false;
  }
  if (!emailForm.newCode.trim()) {
    showToast('请输入新邮箱验证码');
    return false;
  }
  if (auth.user?.email && !emailForm.oldCode.trim()) {
    showToast('请输入当前邮箱验证码');
    return false;
  }
  try {
    await auth.bindEmail({
      email,
      newCode: emailForm.newCode.trim(),
      oldCode: emailForm.oldCode.trim() || undefined
    });
    showToast('邮箱已保存');
    return true;
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '邮箱保存失败' });
    return false;
  }
}

async function beforePasswordClose(action: string) {
  if (action !== 'confirm') return true;

  if (passwordStep.value === 'verify') {
    if (!passwordForm.code.trim()) {
      showToast('请输入邮箱验证码');
      return false;
    }
    try {
      await api.post('/auth/password/code/verify', { code: passwordForm.code.trim() });
      passwordStep.value = 'reset';
      return false;
    } catch (error) {
      showToast({ type: 'fail', message: error instanceof Error ? error.message : '验证码验证失败' });
      return false;
    }
  }

  if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
    showToast('请填写新密码');
    return false;
  }
  const passwordMessage = passwordPolicyMessage(passwordForm.newPassword);
  if (passwordMessage) {
    showToast(passwordMessage);
    return false;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    showToast('两次输入的新密码不一致');
    return false;
  }
  try {
    await auth.changePassword(passwordForm.newPassword, passwordForm.code.trim());
    showToast('密码已修改');
    return true;
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '密码修改失败' });
    return false;
  }
}

async function togglePreference(key: 'autoShowExplanation' | 'autoAddWrong' | 'autoAdvanceOnCorrect' | 'showQuestionOverview') {
  try {
    await auth.updatePreferences({ [key]: !preferences.value[key] });
    showToast('偏好已保存');
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '偏好保存失败' });
  }
}

async function setFontSize(value: UserPreferences['questionFontSize']) {
  try {
    await auth.updatePreferences({ questionFontSize: value });
    showFontDialog.value = false;
    showToast('字号已保存');
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '字号保存失败' });
  }
}

async function handleLogout() {
  try {
    await showConfirmDialog({ title: '退出登录', message: '确定退出当前账号吗？' });
    await auth.logout();
    await router.replace('/login');
  } catch {
    // 用户取消退出
  }
}
</script>
