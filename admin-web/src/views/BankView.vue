<template>
  <section>
    <div class="toolbar"><el-select v-model="subjectId" placeholder="筛选科目" clearable @change="load"><el-option v-for="s in subjects" :key="s.id" :label="s.name" :value="s.id" /></el-select><el-button type="primary" @click="openCreate">新增题库</el-button></div>
    <el-card><el-table :data="rows" stripe>
      <el-table-column prop="name" label="题库/单元" min-width="180" />
      <el-table-column prop="subjectName" label="科目" width="150" />
      <el-table-column prop="description" label="描述" min-width="220" />
      <el-table-column prop="questionCount" label="题数" width="90" />
      <el-table-column prop="isActive" label="状态" width="90"><template #default="{row}"><el-tag :type="row.isActive?'success':'info'">{{ row.isActive ? '启用' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="180"><template #default="{row}"><el-button size="small" @click="openEdit(row)">编辑</el-button><el-button size="small" type="danger" @click="remove(row.id)">删除</el-button></template></el-table-column>
    </el-table></el-card>
    <el-dialog v-model="visible" :title="form.id ? '编辑题库' : '新增题库'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="科目"><el-select v-model="form.subjectId" style="width:100%"><el-option v-for="s in subjects" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
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
const rows=ref<any[]>([]), subjects=ref<any[]>([]), visible=ref(false), subjectId=ref('');
const form=reactive<any>({ id:'', subjectId:'', name:'', description:'', isActive:true });
async function loadSubjects(){ subjects.value=await api.get('/admin/subjects'); }
async function load(){ rows.value=await api.get(`/admin/banks${subjectId.value?`?subjectId=${subjectId.value}`:''}`); }
function openCreate(){ Object.assign(form,{id:'',subjectId:subjectId.value || subjects.value[0]?.id || '',name:'',description:'',isActive:true}); visible.value=true; }
function openEdit(row:any){ Object.assign(form,row); visible.value=true; }
async function save(){ const payload={subjectId:form.subjectId,name:form.name,description:form.description,isActive:form.isActive}; form.id?await api.put(`/admin/banks/${form.id}`,payload):await api.post('/admin/banks',payload); ElMessage.success('已保存'); visible.value=false; load(); }
async function remove(id:string){ await ElMessageBox.confirm('确认删除这个题库？关联题目也会删除。','危险操作'); await api.delete(`/admin/banks/${id}`); ElMessage.success('已删除'); load(); }
onMounted(async()=>{ await loadSubjects(); await load(); });
</script>
