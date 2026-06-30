<template>
  <section>
    <el-card>
      <template #header><strong>JSON 题库导入</strong></template>
      <el-alert title='选择题 answer 必须是数组；多选题要拆成 ["A","C","D"]，不要写 "ACD"。填空题统一使用 fill + blanks。' type="info" show-icon class="mb" />
      <el-input v-model="jsonText" type="textarea" :rows="18" placeholder='粘贴 JSON；选择题使用 "answer": ["A"] 或 ["A","C","D"]；填空题使用 "blanks": [{ "label": "1", "answer": ["答案1", "答案2"] }]。' />
      <div class="toolbar bottom"><el-button @click="fillSample">填入示例</el-button><el-button type="primary" :loading="loading" @click="submit">开始导入</el-button></div>
    </el-card>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { api } from '../api/request';
const jsonText=ref(''); const loading=ref(false);
function fillSample(){
  jsonText.value=JSON.stringify({
    version:1,
    subject:{id:'demo-subject',name:'填空题示例',color:'#5b8def'},
    unit:{id:'demo-bank',name:'单空与多空'},
    questions:[
      {
        id:'demo-choice-001',
        type:'multiple',
        typeLabel:'多选题',
        difficulty:'easy',
        score:1,
        question:'下列哪些选项属于标准多选题导入格式？',
        options:[
          {key:'A',text:'answer 使用数组'},
          {key:'B',text:'多选答案拆成独立选项'},
          {key:'C',text:'选项使用 key/text'},
          {key:'D',text:'answer 写成 ACD'}
        ],
        answer:['A','B','C'],
        explanation:'多选题必须写成 answer: ["A","B","C"]，不要写成 "ABC"。'
      },
      {
        id:'demo-vocab-001',
        type:'fill',
        typeLabel:'词汇填空',
        difficulty:'easy',
        tags:['Unit 1','Words in use'],
        score:1,
        question:'充分地；足够地\\n\\n请写出对应的英文候选词 / 短语。',
        blanks:[
          {label:'1',answer:['adequately','sufficiently'],pronunciation:{text:'adequately',lang:'en-US'}}
        ],
        explanation:'**正确词汇：** adequately\\n\\n中文记忆：充分地；足够地\\n\\n同义可接受答案：sufficiently'
      },
      {
        id:'demo-fill-multi-001',
        type:'fill',
        typeLabel:'多空填空',
        difficulty:'medium',
        score:2,
        question:'The noun is ____, and the adjective form is ____.',
        blanks:[
          {label:'1',prompt:'名词',answer:['aspiration'],pronunciation:{text:'aspiration',lang:'en-US'}},
          {label:'2',prompt:'形容词',answer:['aspirational','ambitious'],pronunciation:{text:'aspirational',lang:'en-US'}}
        ],
        explanation:'**解析：**\\n\\n第 1 空填 aspiration。\\n\\n第 2 空可填 aspirational，也可接受 ambitious。'
      },
      {
        id:'demo-general-fill-001',
        type:'fill',
        typeLabel:'通用填空',
        difficulty:'medium',
        score:2,
        question:'水的化学式是____，标准大气压下沸点约为____摄氏度。',
        blanks:[
          {label:'1',prompt:'化学式',answer:['H2O','H₂O']},
          {label:'2',prompt:'温度',answer:['100','一百']}
        ],
        explanation:'**解析：** 非英语词汇类填空通常不需要 pronunciation。'
      }
    ]
  },null,2);
}
async function submit(){ loading.value=true; try{ const payload=JSON.parse(jsonText.value); const result=await api.post<any>('/admin/import/json',payload); ElMessage.success(`导入成功：${result.questionCount} 道题`); }catch(e){ ElMessage.error(e instanceof Error?e.message:'导入失败'); }finally{ loading.value=false; } }
</script>
