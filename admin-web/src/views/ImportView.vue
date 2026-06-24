<template>
  <section>
    <el-card>
      <template #header><strong>JSON 题库导入</strong></template>
      <el-alert title="当前版本先支持标准 QandA JSON 导入；学习通文本解析下一步再做。" type="info" show-icon class="mb" />
      <el-input v-model="jsonText" type="textarea" :rows="18" placeholder='粘贴 JSON，例如 { "subject": {"name":"大学语文"}, "unit": {"name":"第1课"}, "questions": [] }' />
      <div class="toolbar bottom"><el-button @click="fillSample">填入示例</el-button><el-button type="primary" :loading="loading" @click="submit">开始导入</el-button></div>
    </el-card>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { api } from '../api/request';
const jsonText=ref(''); const loading=ref(false);
function fillSample(){ jsonText.value=JSON.stringify({version:1,subject:{id:'demo-subject',name:'演示科目',color:'#5b8def'},unit:{id:'demo-bank',name:'演示题库'},questions:[{id:'demo-001',type:'single',score:5,question:'这是一个演示单选题？',options:[{key:'A',text:'正确选项'},{key:'B',text:'错误选项'}],answer:['A'],explanation:'这里是答案解析。'}]},null,2); }
async function submit(){ loading.value=true; try{ const payload=JSON.parse(jsonText.value); const result=await api.post<any>('/admin/import/json',payload); ElMessage.success(`导入成功：${result.questionCount} 道题`); }catch(e){ ElMessage.error(e instanceof Error?e.message:'导入失败'); }finally{ loading.value=false; } }
</script>
