<template>
  <section class="fill-answer-editor">
    <div class="fill-answer-toolbar">
      <el-radio-group v-model="modeModel" size="large">
        <el-radio-button label="single">单空</el-radio-button>
        <el-radio-button label="multi">多空</el-radio-button>
      </el-radio-group>
      <div class="fill-answer-hint">{{ modeHint }}</div>
    </div>

    <div v-if="modeModel === 'single'" class="fill-answer-panel">
      <div class="fill-panel-head">
        <div>
          <strong>一个空的正确答案</strong>
          <span>下面任意一个答案都判为正确。</span>
        </div>
        <el-button size="small" @click="addSingleAnswer">添加可接受答案</el-button>
      </div>
      <div class="fill-answer-stack">
        <div v-for="(answer, index) in singleAnswers" :key="answer.id" class="fill-answer-row">
          <span class="fill-answer-index">{{ index + 1 }}</span>
          <el-input
            :model-value="answer.value"
            placeholder="例如：adequately"
            clearable
            @update:model-value="updateSingleAnswer(index, $event)"
          />
          <el-button :disabled="singleAnswers.length <= 1" @click="removeSingleAnswer(index)">删除</el-button>
        </div>
      </div>
    </div>

    <div v-else class="fill-answer-panel">
      <div class="fill-panel-head">
        <div>
          <strong>多个空的正确答案</strong>
          <span>每一组对应题目中的一个空，每个空可以有多个可接受答案。</span>
        </div>
        <el-button size="small" type="primary" plain @click="addBlank">添加一个空</el-button>
      </div>
      <div class="fill-blank-stack">
        <article v-for="(blank, blankIndex) in multiBlanks" :key="blank.id" class="fill-blank-card">
          <header class="fill-blank-head">
            <div>
              <strong>第 {{ blankIndex + 1 }} 空</strong>
              <el-tag size="small" effect="plain">{{ countFilledAnswers(blank) || 0 }} 个答案</el-tag>
            </div>
            <el-button :disabled="multiBlanks.length <= 1" @click="removeBlank(blankIndex)">删除此空</el-button>
          </header>
          <div class="fill-answer-stack">
            <div v-for="(answer, answerIndex) in blank.answers" :key="answer.id" class="fill-answer-row">
              <span class="fill-answer-index">{{ answerIndex + 1 }}</span>
              <el-input
                :model-value="answer.value"
                :placeholder="answerIndex === 0 ? '这个空的标准答案' : '这个空的另一个可接受答案'"
                clearable
                @update:model-value="updateBlankAnswer(blankIndex, answerIndex, $event)"
              />
              <el-button :disabled="blank.answers.length <= 1" @click="removeBlankAnswer(blankIndex, answerIndex)">删除</el-button>
            </div>
          </div>
          <el-button class="fill-inline-action" text type="primary" @click="addBlankAnswer(blankIndex)">
            添加这个空的另一个答案
          </el-button>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElRadioButton, ElRadioGroup } from 'element-plus/es/components/radio/index';
import { ElTag } from 'element-plus/es/components/tag/index';
import {
  normalizeFillAnswerPayload,
  normalizeFillMode,
  toMultiFillAnswers,
  toSingleFillAnswers,
  type FillMode
} from '../utils/fillAnswers';

type AnswerInput = { id: number; value: string };
type BlankInput = { id: number; answers: AnswerInput[] };

const props = withDefaults(defineProps<{
  mode?: FillMode;
  answer?: unknown;
}>(), {
  mode: 'single',
  answer: () => []
});

const emit = defineEmits<{
  'update:mode': [value: FillMode];
  'update:answer': [value: string[] | string[][]];
}>();

let nextId = 1;
const singleAnswers = ref<AnswerInput[]>([emptyAnswer()]);
const multiBlanks = ref<BlankInput[]>([emptyBlank()]);

const modeModel = computed({
  get: () => normalizeFillMode(props.mode),
  set: (mode: FillMode) => switchMode(mode)
});

const modeHint = computed(() => {
  return modeModel.value === 'multi'
    ? '适合一句话里有多个空，比如第 1 空填公式、第 2 空填单位。'
    : '适合一道题只需要填一个答案，允许设置多个同义答案。';
});

watch(
  () => [props.answer, props.mode],
  () => syncFromProps(),
  { deep: true, immediate: true }
);

function emptyAnswer(value = ''): AnswerInput {
  return { id: nextId++, value };
}

function emptyBlank(answers: string[] = ['']): BlankInput {
  return { id: nextId++, answers: answers.length ? answers.map((answer) => emptyAnswer(answer)) : [emptyAnswer()] };
}

function syncFromProps() {
  const mode = normalizeFillMode(props.mode);
  if (mode === 'multi') {
    const groups = toMultiFillAnswers(props.answer);
    multiBlanks.value = groups.length ? groups.map((group) => emptyBlank(group)) : [emptyBlank()];
  } else {
    const values = toSingleFillAnswers(props.answer);
    singleAnswers.value = values.length ? values.map((value) => emptyAnswer(value)) : [emptyAnswer()];
  }
}

function switchMode(mode: FillMode) {
  const normalizedMode = normalizeFillMode(mode);
  if (normalizedMode === modeModel.value) return;
  if (normalizedMode === 'multi') {
    const values = compactSingleAnswers();
    multiBlanks.value = values.length ? values.map((value) => emptyBlank([value])) : [emptyBlank()];
    emit('update:mode', 'multi');
    emitMulti();
    return;
  }

  const values = compactMultiBlanks().flat();
  singleAnswers.value = values.length ? values.map((value) => emptyAnswer(value)) : [emptyAnswer()];
  emit('update:mode', 'single');
  emitSingle();
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function compactSingleAnswers() {
  return singleAnswers.value.map((answer) => clean(answer.value)).filter(Boolean);
}

function compactMultiBlanks() {
  return multiBlanks.value
    .map((blank) => blank.answers.map((answer) => clean(answer.value)).filter(Boolean))
    .filter((group) => group.length > 0);
}

function emitSingle() {
  emit('update:answer', normalizeFillAnswerPayload(compactSingleAnswers(), 'single') as string[]);
}

function emitMulti() {
  emit('update:answer', normalizeFillAnswerPayload(compactMultiBlanks(), 'multi') as string[][]);
}

function updateSingleAnswer(index: number, value: string | number) {
  singleAnswers.value[index].value = String(value ?? '');
  emitSingle();
}

function addSingleAnswer() {
  singleAnswers.value.push(emptyAnswer());
}

function removeSingleAnswer(index: number) {
  if (singleAnswers.value.length <= 1) return;
  singleAnswers.value.splice(index, 1);
  emitSingle();
}

function updateBlankAnswer(blankIndex: number, answerIndex: number, value: string | number) {
  const blank = multiBlanks.value[blankIndex];
  if (!blank) return;
  blank.answers[answerIndex].value = String(value ?? '');
  emitMulti();
}

function addBlank() {
  multiBlanks.value.push(emptyBlank());
}

function removeBlank(index: number) {
  if (multiBlanks.value.length <= 1) return;
  multiBlanks.value.splice(index, 1);
  emitMulti();
}

function addBlankAnswer(blankIndex: number) {
  multiBlanks.value[blankIndex]?.answers.push(emptyAnswer());
}

function removeBlankAnswer(blankIndex: number, answerIndex: number) {
  const blank = multiBlanks.value[blankIndex];
  if (!blank || blank.answers.length <= 1) return;
  blank.answers.splice(answerIndex, 1);
  emitMulti();
}

function countFilledAnswers(blank: BlankInput) {
  return blank.answers.filter((answer) => clean(answer.value)).length;
}
</script>

<style scoped>
.fill-answer-editor {
  width: 100%;
  display: grid;
  gap: 12px;
}

.fill-answer-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.fill-answer-hint {
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.fill-answer-panel {
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  background: #f8fafc;
  padding: 14px;
}

.fill-panel-head,
.fill-blank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.fill-panel-head strong,
.fill-blank-head strong {
  display: block;
  color: #0f172a;
  font-size: 14px;
  line-height: 1.4;
}

.fill-panel-head span {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
}

.fill-answer-stack,
.fill-blank-stack {
  display: grid;
  gap: 10px;
}

.fill-answer-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.fill-answer-index {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 13px;
  font-weight: 800;
}

.fill-blank-card {
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  background: #fff;
  padding: 12px;
}

.fill-blank-head > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fill-inline-action {
  margin-top: 8px;
  padding-left: 0;
}

@media (max-width: 760px) {
  .fill-answer-row {
    grid-template-columns: 30px minmax(0, 1fr);
  }

  .fill-answer-row .el-button {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
