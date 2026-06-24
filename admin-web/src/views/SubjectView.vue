<template>
  <section>
    <div class="toolbar"><el-button type="primary" @click="openCreate">新增科目</el-button></div>
    <el-card>
      <el-table :data="rows" stripe>
        <el-table-column prop="name" label="科目名称" min-width="160" />
        <el-table-column prop="description" label="描述" min-width="220" />
        <el-table-column prop="color" label="颜色" width="100"><template #default="{row}"><span class="color-dot" :style="{background:row.color}"></span>{{ row.color }}</template></el-table-column>
        <el-table-column prop="bankCount" label="题库数" width="90" />
        <el-table-column prop="isActive" label="状态" width="90"><template #default="{row}"><el-tag :type="row.isActive?'success':'info'">{{ row.isActive ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="180"><template #default="{row}"><el-button size="small" @click="openEdit(row)">编辑</el-button><el-button size="small" type="danger" @click="remove(row.id)">删除</el-button></template></el-table-column>
      </el-table>
    </el-card>
    <el-dialog v-model="visible" :title="form.id ? '编辑科目' : '新增科目'" width="520px">
      <el-form label-width="88px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
        <el-form-item label="颜色"><el-input v-model="form.color" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.isActive" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="visible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { api } from '../api/request';
const rows = ref<any[]>([]); const visible = ref(false);
const form = reactive<any>({ id:'', name:'', description:'', color:'#5b8def', isActive:true });
async function load(){ rows.value = await api.get('/admin/subjects'); }
function openCreate(){ Object.assign(form,{ id:'', name:'', description:'', color:'#5b8def', isActive:true }); visible.value=true; }
function openEdit(row:any){ Object.assign(form,row); visible.value=true; }
async function save(){ const payload={ name:form.name, description:form.description, color:form.color, isActive:form.isActive }; form.id ? await api.put(`/admin/subjects/${form.id}`, payload) : await api.post('/admin/subjects', payload); ElMessage.success('已保存'); visible.value=false; load(); }
async function remove(id:string){ await ElMessageBox.confirm('确认删除这个科目？关联题库和题目也会删除。','危险操作'); await api.delete(`/admin/subjects/${id}`); ElMessage.success('已删除'); load(); }
onMounted(load);
</script>
