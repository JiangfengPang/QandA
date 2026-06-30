<template>
  <section class="settings-page">
    <el-card class="settings-card system-card" shadow="never" v-loading="systemLoading">
      <template #header>
        <div class="settings-head system-head">
          <div>
            <h2>系统控制</h2>
            <p>高峰期用于保护登录入口、API 和答题队列消费。</p>
          </div>
          <el-button size="small" @click="loadSystemState">刷新</el-button>
        </div>
      </template>

      <div class="system-control-list">
        <div class="system-control-row">
          <div>
            <strong>禁止用户登录</strong>
            <span>开启后普通用户会被强制退出，并且无法登录或注册。</span>
          </div>
          <el-switch
            :model-value="controls.userLoginDisabled"
            :loading="savingControl === 'userLoginDisabled'"
            @change="toggleUserLoginDisabled"
          />
        </div>
        <div class="system-control-row">
          <div>
            <strong>暂停答题队列消费</strong>
            <span>开启后 worker 暂停处理 pending job，API 仍继续响应。</span>
          </div>
          <el-switch
            :model-value="controls.practiceAnswerWorkerPaused"
            :loading="savingControl === 'practiceAnswerWorkerPaused'"
            @change="togglePracticeAnswerWorkerPaused"
          />
        </div>
      </div>
    </el-card>

    <el-card class="settings-card system-card" shadow="never" v-loading="healthLoading">
      <template #header>
        <div class="settings-head system-head">
          <div>
            <h2>系统状态</h2>
            <p>展示队列积压、worker 配置和数据库探测延迟。</p>
          </div>
          <el-button size="small" @click="loadHealth">刷新状态</el-button>
        </div>
      </template>

      <div class="health-grid">
        <div v-for="item in healthCards" :key="item.label" class="health-card" :class="`is-${item.tone}`">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.hint }}</small>
        </div>
      </div>

      <div class="worker-config" v-if="health">
        <strong>Worker 配置</strong>
        <span>batch={{ health.worker?.config?.batchSize }}，concurrency={{ health.worker?.config?.concurrency }}，poll={{ health.worker?.config?.pollMs }}ms，strict={{ health.worker?.config?.strictInterval ? 'on' : 'off' }}</span>
      </div>
      <div class="failed-reasons" v-if="failedReasons.length">
        <strong>最近失败原因</strong>
        <div v-for="item in failedReasons" :key="item.reason">
          <span>{{ item.reason }}</span>
          <small>{{ item.count }}</small>
        </div>
      </div>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="settings-head">
          <div>
            <h2>管理员安全设置</h2>
            <p>修改当前管理员账号密码。新密码需要满足生产环境强密码策略。</p>
          </div>
        </div>
      </template>

      <el-alert
        title="强密码策略"
        description="至少 12 位，并且大写字母、小写字母、数字、特殊字符中至少包含三类。"
        type="warning"
        show-icon
        :closable="false"
        class="password-policy"
      />

      <el-form label-width="110px" class="password-form" @submit.prevent>
        <div class="password-field-grid">
          <el-form-item label="当前密码">
            <el-input v-model="oldPassword" type="password" show-password autocomplete="current-password" placeholder="请输入当前管理员密码" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="newPassword" type="password" show-password autocomplete="new-password" placeholder="至少 12 位，至少包含三类字符" />
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input v-model="confirmPassword" type="password" show-password autocomplete="new-password" placeholder="再次输入新密码" />
          </el-form-item>
        </div>
        <div class="password-actions">
          <el-button type="primary" :loading="saving" @click="submit">保存新密码</el-button>
          <el-button @click="reset">清空</el-button>
        </div>
      </el-form>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElAlert } from 'element-plus/es/components/alert/index';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { ElSwitch } from 'element-plus/es/components/switch/index';
import { useAuthStore } from '../stores/auth';
import { api } from '../api/request';

type SystemControls = {
  userLoginDisabled: boolean;
  practiceAnswerWorkerPaused: boolean;
  userForceLogoutAt?: string | null;
  updatedAt?: string | null;
};

type SystemHealth = {
  database?: { latencyMs?: number };
  controls?: SystemControls;
  queue?: {
    counts?: Record<string, number>;
    sessionCounts?: Record<string, number>;
    recentFiveMinutes?: Record<string, number>;
    failedReasonsTop10?: Array<{ reason: string; count: number }>;
  };
  worker?: {
    config?: {
      batchSize?: number;
      concurrency?: number;
      pollMs?: number;
      strictInterval?: boolean;
    };
  };
  checkedAt?: string;
};

const auth = useAuthStore();
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const saving = ref(false);
const systemLoading = ref(false);
const healthLoading = ref(false);
const savingControl = ref('');
const controls = ref<SystemControls>({
  userLoginDisabled: false,
  practiceAnswerWorkerPaused: false
});
const health = ref<SystemHealth | null>(null);

const failedReasons = computed(() => health.value?.queue?.failedReasonsTop10 || []);
const healthCards = computed(() => {
  const queue = health.value?.queue || {};
  const legacy = queue.counts || {};
  const session = queue.sessionCounts || {};
  const pending = Number(legacy.pending || 0) + Number(legacy.retrying || 0) + Number(session.pending || 0) + Number(session.retrying || 0);
  const failed = Number(legacy.failed || 0) + Number(session.failed || 0);
  const processing = Number(legacy.processing || 0) + Number(session.processing || 0);
  const processed = Number(legacy.processed || 0) + Number(session.processed || 0);
  const latency = Number(health.value?.database?.latencyMs || 0);
  return [
    { label: '维护模式', value: controls.value.userLoginDisabled ? '开启' : '关闭', hint: '普通用户登录控制', tone: controls.value.userLoginDisabled ? 'danger' : 'ok' },
    { label: '队列消费', value: controls.value.practiceAnswerWorkerPaused ? '已暂停' : '运行中', hint: 'worker 消费控制', tone: controls.value.practiceAnswerWorkerPaused ? 'warn' : 'ok' },
    { label: 'Pending', value: formatNumber(pending), hint: '含 retrying', tone: pending > 10000 ? 'danger' : pending > 1000 ? 'warn' : 'ok' },
    { label: 'Processing', value: formatNumber(processing), hint: '当前锁定任务', tone: processing > 100 ? 'warn' : 'ok' },
    { label: 'Failed', value: formatNumber(failed), hint: '需排查原因', tone: failed > 0 ? 'danger' : 'ok' },
    { label: 'Processed', value: formatNumber(processed), hint: '累计已处理', tone: 'ok' },
    { label: 'DB 延迟', value: `${latency}ms`, hint: health.value?.checkedAt || '未刷新', tone: latency > 3000 ? 'danger' : latency > 1000 ? 'warn' : 'ok' }
  ];
});

onMounted(() => {
  void loadSystemState();
});

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

async function loadControls() {
  controls.value = await api.get<SystemControls>('/admin/system/controls');
}

async function loadHealth() {
  healthLoading.value = true;
  try {
    health.value = await api.get<SystemHealth>('/admin/system/health');
    if (health.value.controls) controls.value = health.value.controls;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '系统状态加载失败');
  } finally {
    healthLoading.value = false;
  }
}

async function loadSystemState() {
  systemLoading.value = true;
  try {
    await loadControls();
    await loadHealth();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '系统控制加载失败');
  } finally {
    systemLoading.value = false;
  }
}

async function saveControlPatch(patch: Partial<SystemControls>) {
  const next = await api.put<SystemControls>('/admin/system/controls', patch);
  controls.value = next;
  await loadHealth();
}

async function toggleUserLoginDisabled(value: string | number | boolean) {
  const nextValue = Boolean(value);
  const previous = controls.value.userLoginDisabled;
  if (nextValue) {
    try {
      await ElMessageBox.confirm('开启后，所有普通用户将被强制退出，并且无法登录。确认开启吗？', '确认开启维护模式', {
        confirmButtonText: '确认开启',
        cancelButtonText: '取消',
        type: 'warning'
      });
    } catch {
      controls.value = { ...controls.value, userLoginDisabled: previous };
      return;
    }
  }

  savingControl.value = 'userLoginDisabled';
  controls.value = { ...controls.value, userLoginDisabled: nextValue };
  try {
    await saveControlPatch({ userLoginDisabled: nextValue });
    ElMessage.success(nextValue ? '已开启禁止用户登录' : '已关闭禁止用户登录');
  } catch (error) {
    controls.value = { ...controls.value, userLoginDisabled: previous };
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    savingControl.value = '';
  }
}

async function togglePracticeAnswerWorkerPaused(value: string | number | boolean) {
  const nextValue = Boolean(value);
  const previous = controls.value.practiceAnswerWorkerPaused;
  savingControl.value = 'practiceAnswerWorkerPaused';
  controls.value = { ...controls.value, practiceAnswerWorkerPaused: nextValue };
  try {
    await saveControlPatch({ practiceAnswerWorkerPaused: nextValue });
    ElMessage.success(nextValue ? '已暂停答题队列消费' : '已恢复答题队列消费');
  } catch (error) {
    controls.value = { ...controls.value, practiceAnswerWorkerPaused: previous };
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    savingControl.value = '';
  }
}

function passwordPolicyMessage(value: string) {
  if (value.length < 12) return '新密码至少 12 位';
  const types = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  if (types < 3) return '新密码需包含大写字母、小写字母、数字、特殊字符中的至少三类';
  return '';
}

function reset() {
  oldPassword.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
}

async function submit() {
  if (!oldPassword.value) return ElMessage.warning('请输入当前密码');
  const policyMessage = passwordPolicyMessage(newPassword.value);
  if (policyMessage) return ElMessage.warning(policyMessage);
  if (newPassword.value !== confirmPassword.value) return ElMessage.warning('两次输入的新密码不一致');

  saving.value = true;
  try {
    await auth.changePassword(oldPassword.value, newPassword.value);
    ElMessage.success('管理员密码已修改，请妥善保存新密码');
    reset();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '密码修改失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.settings-page {
  max-width: 860px;
  display: grid;
  gap: 18px;
}
.settings-card {
  border-radius: 18px;
}

.settings-card :deep(.el-card__body) {
  display: grid;
  gap: 20px;
}
.settings-head h2 {
  margin: 0;
  font-size: 22px;
}
.settings-head p {
  margin: 8px 0 0;
  color: #64748b;
}
.system-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.system-control-list {
  display: grid;
  gap: 12px;
}

.system-control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px;
  border: 1px solid #e5edf7;
  border-radius: 8px;
  background: #fbfdff;
}

.system-control-row div {
  display: grid;
  gap: 6px;
}

.system-control-row strong,
.worker-config strong,
.failed-reasons strong {
  color: #0f172a;
}

.system-control-row span,
.worker-config span,
.failed-reasons span {
  color: #64748b;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.health-card {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #e5edf7;
  border-radius: 8px;
  background: #fff;
}

.health-card span,
.health-card small {
  color: #64748b;
}

.health-card strong {
  font-size: 22px;
  color: #0f172a;
}

.health-card.is-ok {
  border-color: #bbf7d0;
}

.health-card.is-warn {
  border-color: #fde68a;
  background: #fffbeb;
}

.health-card.is-danger {
  border-color: #fecaca;
  background: #fef2f2;
}

.worker-config,
.failed-reasons {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid #e5edf7;
  border-radius: 8px;
}

.failed-reasons div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.failed-reasons span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.password-policy {
  margin: 0;
}

.password-form {
  max-width: 680px;
  padding: 18px;
  border: 1px solid #e5edf7;
  border-radius: 14px;
  background: linear-gradient(180deg, #fff 0%, #fbfdff 100%);
}

.password-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.password-field-grid {
  display: grid;
  gap: 16px;
}

.password-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #edf2f7;
}

@media (max-width: 720px) {
  .settings-page {
    max-width: none;
  }

  .password-form {
    max-width: none;
    padding: 14px;
  }

  .password-actions {
    justify-content: stretch;
  }

  .password-actions .el-button {
    flex: 1;
  }

  .system-head,
  .system-control-row {
    align-items: stretch;
    flex-direction: column;
  }

  .health-grid {
    grid-template-columns: 1fr;
  }
}
</style>
