<template>
  <section>
    <div class="toolbar">
      <el-select v-model="bankId" placeholder="筛选题库" filterable clearable style="width:280px" @change="load">
        <el-option v-for="b in banks" :key="b.id" :label="`${b.subjectName} / ${b.name}`" :value="b.id" />
      </el-select>
      <el-input v-model="keyword" placeholder="搜索题干" clearable style="width:260px" @keyup.enter="load" />
      <el-button @click="load">搜索</el-button>
      <el-button type="primary" @click="openCreate">新增题目</el-button>
    </div>
    <el-card>
      <el-table :data="rows" stripe>
        <el-table-column prop="stem" label="题干" min-width="320" show-overflow-tooltip />
        <el-table-column label="类型" width="100"><template #default="{row}">{{ questionTypeLabel(row.type) }}</template></el-table-column>
        <el-table-column label="题库" min-width="180"><template #default="{row}">{{ row.bank?.subject?.name }} / {{ row.bank?.name }}</template></el-table-column>
        <el-table-column prop="score" label="分值" width="80" />
        <el-table-column label="答案" width="140"><template #default="{row}">{{ answerSummary(row) }}</template></el-table-column>
        <el-table-column label="操作" width="180"><template #default="{row}"><el-button size="small" @click="openEdit(row)">编辑</el-button><el-button size="small" type="danger" @click="remove(row.id)">删除</el-button></template></el-table-column>
      </el-table>
      <el-pagination class="pager" layout="prev, pager, next, total" :total="meta.total" :page-size="meta.pageSize" v-model:current-page="meta.page" @current-change="load" />
    </el-card>
    <el-dialog v-model="visible" :title="form.id ? '编辑题目' : '新增题目'" width="980px">
      <el-form label-width="108px">
        <el-form-item label="题库"><el-select v-model="form.bankId" filterable style="width:100%"><el-option v-for="b in banks" :key="b.id" :label="`${b.subjectName} / ${b.name}`" :value="b.id" /></el-select></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type">
            <el-option label="单选" value="single" />
            <el-option label="多选" value="multiple" />
            <el-option label="判断" value="judge" />
            <el-option label="Python题" value="python" />
          </el-select>
        </el-form-item>
        <el-form-item label="题干">
          <el-input v-model="form.stem" type="textarea" :rows="4" placeholder="请输入题目内容，Python题可使用 Markdown" />
        </el-form-item>
        <el-form-item v-if="form.type === 'python'" label="题干预览">
          <div class="markdown-preview-box admin-markdown-body" v-html="renderedQuestionStem" @click="handleMarkdownCopyClick"></div>
        </el-form-item>

        <template v-if="form.type === 'python'">
          <el-form-item label="正确答案">
            <div class="markdown-editor-grid">
              <div class="markdown-editor-pane">
                <div class="markdown-editor-title">Markdown 原文</div>
                <el-input
                  v-model="form.pythonAnswerMarkdown"
                  type="textarea"
                  :rows="18"
                  placeholder="支持 Markdown。代码请使用 ```python 代码块包起来。"
                />
              </div>
              <div class="markdown-preview-pane">
                <div class="markdown-editor-title">实时预览</div>
                <div class="markdown-preview-box admin-markdown-body" v-html="renderedPythonAnswer" @click="handleMarkdownCopyClick"></div>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="填写示例">
            <div class="markdown-help">
              <div>### 参考答案</div>
              <div>```python</div>
              <div>print("hello")</div>
              <div>```</div>
              <div>### 答案解析</div>
              <div>这里写解题思路。</div>
            </div>
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="选项">
            <div class="option-editor">
              <div v-for="(option,index) in form.options" :key="index" class="option-line">
                <el-input v-model="option.label" style="width:80px" placeholder="A" />
                <el-input v-model="option.content" placeholder="选项内容" />
                <el-button type="danger" @click="form.options.splice(index,1)">删除</el-button>
              </div>
              <el-button @click="addOption">添加选项</el-button>
            </div>
          </el-form-item>
          <el-form-item label="答案"><el-select v-model="form.answer" multiple style="width:100%"><el-option v-for="o in form.options" :key="o.label" :label="o.label" :value="o.label" /></el-select></el-form-item>
          <el-form-item label="解析"><el-input v-model="form.explanation" type="textarea" :rows="3" /></el-form-item>
        </template>

        <el-form-item label="分值"><el-input-number v-model="form.score" :min="0" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="visible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { api } from '../api/request';
import { decodeMarkdownCode, renderMarkdown } from '../utils/markdown';
const rows=ref<any[]>([]), banks=ref<any[]>([]), visible=ref(false), bankId=ref(''), keyword=ref(''); const meta=reactive({page:1,pageSize:20,total:0});
const form=reactive<any>({id:'',bankId:'',type:'single',stem:'',score:0,answer:[],explanation:'',options:[],pythonAnswerMarkdown:''});
const renderedQuestionStem = computed(() => renderMarkdown(form.stem || ''));
const renderedPythonAnswer = computed(() => renderMarkdown(form.pythonAnswerMarkdown || ''));
async function loadBanks(){ banks.value=await api.get('/admin/banks'); }
async function load(){ const qs=new URLSearchParams({page:String(meta.page),pageSize:String(meta.pageSize)}); if(bankId.value) qs.set('bankId',bankId.value); if(keyword.value) qs.set('keyword',keyword.value); const data=await api.get<any>(`/admin/questions?${qs}`); rows.value=data.rows; Object.assign(meta,data.meta); }

async function handleMarkdownCopyClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>('[data-md-copy="code"]');
  if (!button) return;
  const code = decodeMarkdownCode(button.dataset.code || '');
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    ElMessage.success('代码已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

function questionTypeLabel(type:string){ return ({single:'单选',multiple:'多选',judge:'判断',fill:'填空',python:'Python题'} as Record<string,string>)[type] || type || '题目'; }
function answerSummary(row:any){ if(row.type==='python') return 'Markdown答案'; return Array.isArray(row.answerJson) ? row.answerJson.join('、') : ''; }
function applyJudgeOptions(){ form.options=[{label:'A',content:'正确'},{label:'B',content:'错误'}]; form.answer=form.answer.map((item:string)=>String(item).toLowerCase()==='true'||item==='正确'||item==='对'?'A':String(item).toLowerCase()==='false'||item==='错误'||item==='错'?'B':item).filter((item:string)=>item==='A'||item==='B').slice(0,1); }
function ensureChoiceOptions(){ if(!Array.isArray(form.options) || form.options.length===0) form.options=[{label:'A',content:''},{label:'B',content:''}]; }
function addOption(){ if(form.type==='judge') return applyJudgeOptions(); ensureChoiceOptions(); const label=String.fromCharCode(65+form.options.length); form.options.push({label,content:''}); }
function resetPythonAnswer(){ if(!form.pythonAnswerMarkdown) form.pythonAnswerMarkdown='### 参考答案\n\n```python\n# 在这里填写正确答案代码\nprint("hello")\n```\n\n### 答案解析\n\n这里填写解题思路。'; }
function openCreate(){ Object.assign(form,{id:'',bankId:bankId.value || banks.value[0]?.id || '',type:'single',stem:'',score:0,answer:[],explanation:'',options:[{label:'A',content:''},{label:'B',content:''}],pythonAnswerMarkdown:''}); visible.value=true; }
function openEdit(row:any){ const answers=Array.isArray(row.answerJson)?row.answerJson:[]; Object.assign(form,{id:row.id,bankId:row.bankId,type:row.type,stem:row.stem,score:row.score,answer:answers,explanation:row.explanation||'',options:(row.options||[]).map((o:any)=>({label:o.label,content:o.content})),pythonAnswerMarkdown:row.type==='python'?String(answers[0]||''):''}); if(form.type==='judge') applyJudgeOptions(); visible.value=true; }
async function save(){
  if(!form.bankId) return ElMessage.warning('请选择题库');
  if(!String(form.stem||'').trim()) return ElMessage.warning('请输入题干');
  if(form.type==='python' && !String(form.pythonAnswerMarkdown||'').trim()) return ElMessage.warning('请输入正确答案 Markdown');
  const payload=form.type==='python'
    ? {bankId:form.bankId,type:form.type,stem:form.stem,score:form.score,answer:[form.pythonAnswerMarkdown],explanation:'',options:[]}
    : {bankId:form.bankId,type:form.type,stem:form.stem,score:form.score,answer:form.answer,explanation:form.explanation,options:form.options};
  form.id?await api.put(`/admin/questions/${form.id}`,payload):await api.post('/admin/questions',payload); ElMessage.success('已保存'); visible.value=false; load(); }
async function remove(id:string){ await ElMessageBox.confirm('确认删除这道题？','危险操作'); await api.delete(`/admin/questions/${id}`); ElMessage.success('已删除'); load(); }
watch(()=>form.type,(type)=>{ if(type==='judge') applyJudgeOptions(); if(type==='python') resetPythonAnswer(); if(type==='single'||type==='multiple') ensureChoiceOptions(); });
onMounted(async()=>{ await loadBanks(); await load(); });
</script>
