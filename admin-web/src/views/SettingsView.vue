<template>
  <section class="settings-page">
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
import { ref } from 'vue';
import { ElAlert } from 'element-plus/es/components/alert/index';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const saving = ref(false);

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
}
</style>
