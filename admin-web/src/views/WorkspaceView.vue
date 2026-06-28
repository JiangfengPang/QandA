<template>
  <section class="workspace-page">
    <el-card class="workspace-header" shadow="never">
      <div>
        <div class="selection-kicker">当前选择</div>
        <h2>{{ currentTitle }}</h2>
        <p>{{ currentSubTitle }}</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="activeTab = 'import'">导入 JSON</el-button>
        <el-button :disabled="!selectedBank" @click="activeTab = 'questions'">查看题目</el-button>
        <el-button @click="loadTree">刷新结构</el-button>
      </div>
    </el-card>

    <div class="workspace-grid">
      <el-card class="resource-card" shadow="never">
        <template #header>
          <div class="card-head">
            <div class="card-title">题库资源树</div>
            <el-button size="small" @click="loadTree">刷新</el-button>
          </div>
        </template>

        <el-input v-model="treeKeyword" class="resource-search" placeholder="搜索科目 / 题库" clearable />
        <div class="tree-list">
          <div
            v-for="subject in filteredTree"
            :key="subject.id"
            class="tree-subject"
            :class="{
              active: selectedSubject?.id === subject.id,
              'is-dragging': draggingSubjectId === subject.id,
              'is-drop-target': dragOverSubjectId === subject.id && draggingSubjectId !== subject.id
            }"
            @dragover.prevent="handleSubjectDragOver(subject, $event)"
            @dragleave="handleSubjectDragLeave(subject)"
            @drop.prevent="handleSubjectDrop(subject)"
          >
            <div
              class="tree-subject-main"
              :class="{ 'active-row': selectedType === 'subject' && selectedSubject?.id === subject.id, 'is-sortable': canDragSubjects }"
              :draggable="canDragSubjects"
              :title="canDragSubjects ? '拖动调整科目排序' : undefined"
              @click="selectSubject(subject)"
              @dragstart.stop="handleSubjectDragStart(subject, $event)"
              @dragend="handleSubjectDragEnd"
            >
              <span class="tree-drag-handle" aria-hidden="true">⋮⋮</span>
              <button
                class="tree-toggle"
                type="button"
                :title="isSubjectExpanded(subject.id) ? '折叠科目' : '展开科目'"
                @click.stop="toggleSubject(subject)"
              >
                {{ isSubjectExpanded(subject.id) ? '▾' : '▸' }}
              </button>
              <span class="color-dot" :style="{ background: subject.color || '#5b8def' }"></span>
              <span class="tree-title">{{ subject.name }}</span>
              <span class="tree-count">{{ subject.banks.length }}</span>
            </div>
            <transition name="collapse-fade">
              <div v-show="treeKeyword.trim() || isSubjectExpanded(subject.id)" class="tree-banks">
                <button
                  v-for="bank in subject.banks"
                  :key="bank.id"
                  class="tree-bank"
                  :class="{
                    active: selectedBank?.id === bank.id,
                    'is-sortable': canDragBanks(subject),
                    'is-dragging': draggingBankId === bank.id,
                    'is-drop-target': dragOverBankId === bank.id && draggingBankId !== bank.id
                  }"
                  :draggable="canDragBanks(subject)"
                  :title="canDragBanks(subject) ? '拖动调整当前科目下的单元排序' : undefined"
                  @click="selectBank(subject, bank)"
                  @dragstart.stop="handleBankDragStart(subject, bank, $event)"
                  @dragover.prevent="handleBankDragOver(subject, bank, $event)"
                  @dragleave="handleBankDragLeave(bank)"
                  @drop.prevent="handleBankDrop(subject, bank)"
                  @dragend="handleBankDragEnd"
                >
                  <span class="tree-drag-handle tree-bank-handle" aria-hidden="true">⋮⋮</span>
                  <span class="tree-bank-name">{{ bank.name }}</span>
                  <small>{{ bank.questionCount }} 题</small>
                </button>
              </div>
            </transition>
          </div>
        </div>
      </el-card>

      <div class="workspace-main">
        <el-tabs v-model="activeTab" class="workspace-tabs">
          <el-tab-pane label="结构管理" name="structure">
            <el-row :gutter="16">
              <el-col :xs="24" :md="12">
                <el-card shadow="never" class="panel-card operation-card">
                  <template #header><div class="card-title">科目操作</div></template>
                  <el-tabs v-model="subjectMode" type="card" class="form-mode-tabs" @tab-change="handleSubjectModeChange">
                    <el-tab-pane label="修改科目" name="edit" />
                    <el-tab-pane label="新增科目" name="create" />
                  </el-tabs>
                  <el-alert
                    v-if="subjectMode === 'edit' && !selectedSubject"
                    title="请先在左侧资源树选择一个科目，再修改科目信息"
                    type="warning"
                    show-icon
                    class="mb"
                  />
                  <el-form label-width="92px">
                    <el-form-item label="科目名称"><el-input v-model="subjectForm.name" :disabled="subjectMode === 'edit' && !selectedSubject" placeholder="例如：大学语文" /></el-form-item>
                    <el-form-item label="描述"><el-input v-model="subjectForm.description" :disabled="subjectMode === 'edit' && !selectedSubject" type="textarea" :rows="3" placeholder="可选：科目说明" /></el-form-item>
                    <el-form-item label="颜色">
                      <div class="color-field">
                        <span class="color-preview" :style="{ background: subjectForm.color || '#5b8def' }"></span>
                        <el-color-picker v-model="subjectForm.color" :disabled="subjectMode === 'edit' && !selectedSubject" show-alpha :predefine="['#f05c5c', '#2563eb', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6']" />
                        <el-input v-model="subjectForm.color" :disabled="subjectMode === 'edit' && !selectedSubject" placeholder="#f05c5c" />
                      </div>
                    </el-form-item>
                    <el-form-item label="启用"><el-switch v-model="subjectForm.isActive" :disabled="subjectMode === 'edit' && !selectedSubject" /></el-form-item>
                  </el-form>
                  <div class="form-actions">
                    <el-button v-if="subjectMode === 'create'" @click="resetSubjectForm">清空表单</el-button>
                    <el-button type="primary" :disabled="subjectMode === 'edit' && !selectedSubject" @click="saveSubject">{{ subjectMode === 'edit' ? '保存修改' : '新增科目' }}</el-button>
                    <el-button v-if="subjectMode === 'edit'" type="danger" plain :disabled="!subjectForm.id" @click="deleteSubject">删除当前科目</el-button>
                  </div>
                  <p class="mode-hint">{{ subjectMode === 'edit' ? '当前为修改模式：表单内容来自左侧选中的科目，保存后更新当前科目。' : '当前为新增模式：保存后会创建新科目，并显示在资源树最前面。' }}</p>
                </el-card>
              </el-col>

              <el-col :xs="24" :md="12">
                <el-card shadow="never" class="panel-card operation-card">
                  <template #header><div class="card-title">题库 / 单元操作</div></template>
                  <el-tabs v-model="bankMode" type="card" class="form-mode-tabs" @tab-change="handleBankModeChange">
                    <el-tab-pane label="修改题库" name="edit" />
                    <el-tab-pane label="新增题库" name="create" />
                  </el-tabs>
                  <el-alert v-if="!selectedSubject" title="请先在左侧选择一个科目" type="warning" show-icon class="mb" />
                  <el-alert
                    v-else-if="bankMode === 'edit' && !selectedBank"
                    title="请先在左侧选择一个题库/单元，再修改题库信息"
                    type="warning"
                    show-icon
                    class="mb"
                  />
                  <el-form label-width="92px">
                    <el-form-item label="所属科目"><el-input :model-value="selectedSubject?.name || ''" disabled /></el-form-item>
                    <el-form-item label="题库名称"><el-input v-model="bankForm.name" :disabled="!selectedSubject || (bankMode === 'edit' && !selectedBank)" placeholder="例如：1-序二篇" /></el-form-item>
                    <el-form-item label="描述"><el-input v-model="bankForm.description" :disabled="!selectedSubject || (bankMode === 'edit' && !selectedBank)" type="textarea" :rows="3" placeholder="可选：题库说明" /></el-form-item>
                    <el-form-item label="启用"><el-switch v-model="bankForm.isActive" :disabled="!selectedSubject || (bankMode === 'edit' && !selectedBank)" /></el-form-item>
                  </el-form>
                  <div class="form-actions">
                    <el-button v-if="bankMode === 'create'" :disabled="!selectedSubject" @click="resetBankForm">清空表单</el-button>
                    <el-button type="primary" :disabled="!selectedSubject || (bankMode === 'edit' && !selectedBank)" @click="saveBank">{{ bankMode === 'edit' ? '保存修改' : '新增题库' }}</el-button>
                    <el-button v-if="bankMode === 'edit'" type="danger" plain :disabled="!bankForm.id" @click="deleteBank">删除当前题库</el-button>
                  </div>
                  <p class="mode-hint">{{ bankMode === 'edit' ? '当前为修改模式：表单内容来自左侧选中的题库/单元，保存后更新当前题库。' : '当前为新增模式：保存后会在左侧当前科目下创建新题库，并按添加时间排在最后面。' }}</p>
                </el-card>
              </el-col>
            </el-row>
          </el-tab-pane>

          <el-tab-pane label="题目导入" name="import">
            <el-card shadow="never" class="panel-card">
              <template #header>
                <div class="card-head">
                  <div class="card-title">题目导入</div>
                  <span class="muted">支持阅读理解快捷导入与 QandA 标准 JSON</span>
                </div>
              </template>
              <div class="import-target">
                <el-tag type="success" v-if="selectedBank">目标：{{ selectedSubject?.name }} / {{ selectedBank.name }}</el-tag>
                <el-tag type="warning" v-else-if="selectedSubject">已选科目：{{ selectedSubject.name }}；JSON 内需包含 unit.name，或先新建/选择题库</el-tag>
                <el-tag type="info" v-else>未选择目标，将按 JSON 内 subject.name 与 unit.name 自动导入</el-tag>
              </div>

              <el-tabs v-model="importMode" class="import-mode-tabs">
                <el-tab-pane label="阅读理解快捷导入" name="reading">
                  <el-alert
                    title="一篇原文可以一次导入多道阅读理解小题"
                    description="把原文粘到“阅读原文”，把小题按 1. 题干 答案 / A. 选项 的格式粘到“小题与选项”。解析可写在每题选项后：解析：……"
                    type="success"
                    show-icon
                    class="mb"
                  />
                  <el-form label-width="96px" class="reading-import-form">
                    <el-row :gutter="14">
                      <el-col v-if="!selectedSubject" :xs="24" :md="12">
                        <el-form-item label="科目名称">
                          <el-input v-model="readingImport.subjectName" placeholder="例如：大学英语阅读理解" />
                        </el-form-item>
                      </el-col>
                      <el-col v-if="!selectedBank" :xs="24" :md="12">
                        <el-form-item label="题库名称">
                          <el-input v-model="readingImport.bankName" placeholder="例如：四级阅读 Passage One" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="14">
                      <el-col :xs="24" :md="18">
                        <el-form-item label="总题干">
                          <el-input v-model="readingImport.stem" placeholder="Read the passage and choose the best answer." />
                        </el-form-item>
                      </el-col>
                      <el-col :xs="24" :md="6">
                        <el-form-item label="分值">
                          <el-input-number v-model="readingImport.score" :min="0" :step="0.5" controls-position="right" style="width:100%" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-form-item label="阅读原文">
                      <el-input
                        v-model="readingImport.passage"
                        class="reading-import-textarea"
                        type="textarea"
                        :rows="10"
                        placeholder="粘贴阅读理解原文。支持 Markdown，段落之间可保留空行。"
                      />
                    </el-form-item>
                    <el-form-item label="小题与选项">
                      <el-input
                        v-model="readingImport.questionsText"
                        class="reading-import-textarea"
                        type="textarea"
                        :rows="12"
                        placeholder="1. What do we learn from the passage? D&#10;A. Option text&#10;B. Option text&#10;C. Option text&#10;D. Option text&#10;解析：可选解析&#10;&#10;2. Next question? A&#10;A. ..."
                      />
                    </el-form-item>
                  </el-form>
                  <div class="reading-import-actions">
                    <el-button @click="fillReadingSample">填入阅读示例</el-button>
                    <el-button @click="generateReadingJson">生成到 JSON</el-button>
                    <el-button type="primary" :loading="importing" @click="submitReadingImport">直接导入阅读理解</el-button>
                  </div>
                </el-tab-pane>

                <el-tab-pane label="JSON 原始导入" name="json">
                  <el-alert
                    title="填空题统一使用 blanks：单空也写 blanks 里 1 个空，每个空只用 answer 数组。"
                    description='阅读理解题统一使用 type/passageId/question/readingPassage/readingQuestion/options[{ key, text }]/answer/explanation。同一篇短文下的小题必须共用 passageId。'
                    type="info"
                    show-icon
                    class="mb"
                  />

                  <el-upload
                    ref="uploadRef"
                    class="mb"
                    drag
                    accept=".json,application/json"
                    :auto-upload="false"
                    :show-file-list="false"
                    :before-upload="handleFile"
                    :on-change="handleFileChange"
                  >
                    <div class="upload-inner">把 JSON 文件拖到这里，或点击选择文件</div>
                  </el-upload>

                  <el-input
                    v-model="jsonText"
                    type="textarea"
                    :rows="16"
                    placeholder='粘贴 JSON；阅读理解必须使用 "type": "reading"，并填写 passageId / question / readingPassage / readingQuestion / options[{ "key": "A", "text": "..." }] / answer。'
                  />
                  <div class="toolbar bottom">
                    <el-button @click="fillSample">填入示例</el-button>
                    <el-button @click="clearImport">清空</el-button>
                    <el-button type="primary" :loading="importing" @click="submitImport">开始导入</el-button>
                  </div>
                </el-tab-pane>
              </el-tabs>

              <el-result v-if="lastImport" icon="success" title="导入成功" :sub-title="importSummary">
                <template #extra>
                  <el-button type="primary" @click="afterImportViewQuestions">查看导入题目</el-button>
                </template>
              </el-result>
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="当前单元题目" name="questions">
            <el-card shadow="never" class="panel-card">
              <template #header>
                <div class="card-head">
                  <div class="card-title">当前单元题目列表</div>
                  <div class="card-actions">
                    <el-button
                      type="danger"
                      plain
                      size="small"
                      :disabled="!selectedBank || questionMeta.total === 0"
                      @click="clearCurrentBankQuestions"
                    >
                      清空全部
                    </el-button>
                    <el-button type="primary" size="small" :disabled="!selectedBank" @click="openQuestionCreate">新增题目</el-button>
                  </div>
                </div>
              </template>
              <el-alert v-if="!selectedBank" title="请先在左侧选择一个题库/单元" type="warning" show-icon class="mb" />
              <template v-else>
                <div class="toolbar">
                  <el-input v-model="questionKeyword" placeholder="搜索题干" clearable style="max-width:320px" @keyup.enter="loadQuestions" />
                  <el-select v-model="questionType" placeholder="题型" clearable style="width:130px" @change="loadQuestions">
                    <el-option label="单选" value="single" />
                    <el-option label="多选" value="multiple" />
                    <el-option label="判断" value="judge" />
                    <el-option label="填空" value="fill" />
                    <el-option label="Python题" value="python" />
                    <el-option label="阅读理解" value="reading" />
                  </el-select>
                  <el-button @click="loadQuestions">搜索/刷新</el-button>
                </div>
                <el-table class="question-table" :data="questions" stripe border>
                  <el-table-column type="index" width="56" />
                  <el-table-column prop="stem" label="题干" min-width="340" show-overflow-tooltip />
                  <el-table-column label="类型" width="120"><template #default="{ row }">{{ questionTypeLabel(row) }}</template></el-table-column>
                  <el-table-column label="答案" width="130">
                    <template #default="{ row }">{{ questionAnswerSummary(row) }}</template>
                  </el-table-column>
                  <el-table-column prop="score" label="分值" width="80" />
                  <el-table-column label="操作" width="170" fixed="right">
                    <template #default="{ row }">
                      <el-button size="small" @click="openQuestionEdit(row)">编辑</el-button>
                      <el-button size="small" type="danger" @click="deleteQuestion(row.id)">删除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <el-pagination
                  class="pager"
                  layout="prev, pager, next, total"
                  :total="questionMeta.total"
                  :page-size="questionMeta.pageSize"
                  v-model:current-page="questionMeta.page"
                  @current-change="loadQuestions"
                />
              </template>
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="数据库同步" name="sync">
            <el-card shadow="never" class="panel-card">
              <template #header><div class="card-title">数据库状态</div></template>
              <div class="sync-grid">
                <div><span>后端接口</span><strong>{{ status.api || '-' }}</strong></div>
                <div><span>数据库</span><strong>{{ status.database || '-' }}</strong></div>
                <div><span>科目数</span><strong>{{ status.subjectCount ?? '-' }}</strong></div>
                <div><span>题库数</span><strong>{{ status.bankCount ?? '-' }}</strong></div>
                <div><span>题目数</span><strong>{{ status.questionCount ?? '-' }}</strong></div>
                <div><span>答题记录</span><strong>{{ status.answerCount ?? '-' }}</strong></div>
              </div>
              <div class="toolbar bottom">
                <el-button @click="loadStatus">检查状态</el-button>
                <el-button type="primary" @click="loadTree">重新读取题库结构</el-button>
              </div>
            </el-card>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <el-dialog
      v-model="questionDialog"
      :title="questionForm.id ? '编辑题目' : '新增题目'"
      width="980px"
      align-center
      class="question-edit-dialog"
    >
      <el-form label-width="86px">
        <el-form-item label="题型">
          <el-select v-model="questionForm.type">
            <el-option label="单选" value="single" />
            <el-option label="多选" value="multiple" />
            <el-option label="判断" value="judge" />
            <el-option label="填空" value="fill" />
            <el-option label="Python题" value="python" />
            <el-option label="阅读理解" value="reading" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="questionForm.type === 'python'" label="题型标签">
          <el-input
            v-model="questionForm.typeLabel"
            maxlength="40"
            show-word-limit
            placeholder="默认：Python题；例如：Python基础、编程题"
          />
        </el-form-item>
        <el-form-item :label="questionForm.type === 'reading' ? '总题干' : '题干'">
          <el-input v-model="questionForm.stem" type="textarea" :rows="4" :placeholder="questionForm.type === 'reading' ? 'Read the passage and choose the best answer.' : '题目内容'" />
        </el-form-item>
        <template v-if="questionForm.type === 'python'">
          <el-form-item label="正确答案">
            <div class="markdown-editor-grid">
              <div class="markdown-editor-pane">
                <div class="markdown-editor-title">Markdown 原文</div>
                <el-input
                  v-model="questionForm.pythonAnswerMarkdown"
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
        </template>
        <template v-else-if="questionForm.type === 'reading'">
          <div class="reading-question-editor">
            <div class="reading-section-head">
              <span>短文信息</span>
            </div>
          <el-form-item label="阅读原文">
            <el-input
              v-model="questionForm.readingPassage"
              type="textarea"
              :rows="10"
              placeholder="阅读原文"
            />
          </el-form-item>
            <div class="reading-section-head">
              <span>阅读小题</span>
              <el-button type="primary" plain @click="addReadingQuestionItem">添加小题</el-button>
            </div>
            <el-tabs
              v-model="questionForm.activeReadingItemId"
              type="card"
              class="reading-question-tabs"
            >
              <el-tab-pane
                v-for="(item, itemIndex) in questionForm.readingItems"
                :key="item.localId"
                :label="`小题 ${itemIndex + 1}`"
                :name="item.localId"
              >
                <section class="reading-question-block">
                <div class="reading-question-block-head">
                  <strong>小题 {{ itemIndex + 1 }}</strong>
                  <div>
                    <el-button size="small" @click="duplicateReadingQuestionItem(itemIndex)">复制</el-button>
                    <el-button size="small" type="danger" plain :disabled="questionForm.readingItems.length <= 1" @click="removeReadingQuestionItem(itemIndex)">删除</el-button>
                  </div>
                </div>
                <el-form-item label="题干">
                  <el-input
                    v-model="item.readingQuestion"
                    type="textarea"
                    :rows="2"
                    placeholder="题干"
                  />
                </el-form-item>
                <el-form-item label="选项">
                  <div class="option-editor">
                    <div v-for="(option, optionIndex) in item.options" :key="optionIndex" class="option-line">
                      <el-input v-model="option.label" style="width:80px" placeholder="A" />
                      <el-input v-model="option.content" placeholder="选项内容" />
                      <el-button type="danger" plain :disabled="item.options.length <= 2" @click="item.options.splice(optionIndex, 1)">删除</el-button>
                    </div>
                    <el-button @click="addReadingQuestionOption(item)">添加选项</el-button>
                  </div>
                </el-form-item>
                <el-form-item label="答案">
                  <el-select v-model="item.answer" style="width:100%" placeholder="正确答案">
                    <el-option v-for="option in item.options" :key="option.label" :label="option.label" :value="option.label" />
                  </el-select>
                </el-form-item>
                <el-form-item label="解析">
                  <el-input v-model="item.explanation" type="textarea" :rows="3" placeholder="解析" />
                </el-form-item>
              </section>
              </el-tab-pane>
            </el-tabs>
              </div>
        </template>
        <template v-else-if="questionForm.type === 'fill'">
          <el-form-item label="填空答案">
            <FillAnswerEditor v-model:mode="questionForm.fillMode" v-model:answer="questionForm.fillAnswerValue" />
          </el-form-item>
          <el-form-item label="解析"><el-input v-model="questionForm.explanation" type="textarea" :rows="3" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="选项">
            <div class="option-editor">
              <div v-for="(option, index) in questionForm.options" :key="index" class="option-line">
                <el-input v-model="option.label" style="width:80px" placeholder="A" />
                <el-input v-model="option.content" placeholder="选项内容" />
                <el-button type="danger" @click="questionForm.options.splice(index, 1)">删除</el-button>
              </div>
              <el-button @click="addQuestionOption">添加选项</el-button>
            </div>
          </el-form-item>
          <el-form-item label="答案">
            <el-select v-model="questionForm.answer" multiple style="width:100%">
              <el-option v-for="option in questionForm.options" :key="option.label" :label="option.label" :value="option.label" />
            </el-select>
          </el-form-item>
          <el-form-item label="解析"><el-input v-model="questionForm.explanation" type="textarea" :rows="3" /></el-form-item>
        </template>
        <el-form-item label="分值"><el-input-number v-model="questionForm.score" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="questionDialog = false">取消</el-button>
        <el-button type="primary" @click="saveQuestion">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElAlert } from 'element-plus/es/components/alert/index';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElCol } from 'element-plus/es/components/col/index';
import { ElColorPicker } from 'element-plus/es/components/color-picker/index';
import { ElDialog } from 'element-plus/es/components/dialog/index';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElInputNumber } from 'element-plus/es/components/input-number/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { ElPagination } from 'element-plus/es/components/pagination/index';
import { ElResult } from 'element-plus/es/components/result/index';
import { ElRow } from 'element-plus/es/components/row/index';
import { ElOption, ElSelect } from 'element-plus/es/components/select/index';
import { ElSwitch } from 'element-plus/es/components/switch/index';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index';
import { ElTabPane, ElTabs } from 'element-plus/es/components/tabs/index';
import { ElTag } from 'element-plus/es/components/tag/index';
import { ElUpload } from 'element-plus/es/components/upload/index';
import { api } from '../api/request';
import FillAnswerEditor from '../components/FillAnswerEditor.vue';
import { isMultiFillAnswer, normalizeFillAnswerPayload } from '../utils/fillAnswers';
import { decodeMarkdownCode, renderMarkdown } from '../utils/markdown';

type BankNode = {
  id: string;
  legacyId?: string | null;
  subjectId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive: boolean;
  questionCount: number;
  createdAt?: string;
};

type SubjectNode = {
  id: string;
  legacyId?: string | null;
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
  isActive: boolean;
  bankCount: number;
  banks: BankNode[];
};

const tree = ref<SubjectNode[]>([]);
const treeKeyword = ref('');
const expandedSubjectIds = ref<string[]>([]);
const hasInitializedExpansion = ref(false);
const draggingSubjectId = ref('');
const dragOverSubjectId = ref('');
const subjectOrdering = ref(false);
const draggingBankId = ref('');
const draggingBankSubjectId = ref('');
const dragOverBankId = ref('');
const bankOrdering = ref(false);
const selectedSubject = ref<SubjectNode | null>(null);
const selectedBank = ref<BankNode | null>(null);
const selectedType = ref<'none' | 'subject' | 'bank'>('none');
const activeTab = ref('structure');
const subjectMode = ref<'edit' | 'create'>('edit');
const bankMode = ref<'edit' | 'create'>('create');

const subjectForm = reactive({ id: '', name: '', description: '', color: '#5b8def', isActive: true });
const bankForm = reactive({ id: '', name: '', description: '', isActive: true });

const importMode = ref<'reading' | 'json'>('reading');
const jsonText = ref('');
const importing = ref(false);
const lastImport = ref<any>(null);
const uploadRef = ref<any>();
const readingImport = reactive({
  subjectName: '大学英语阅读理解',
  bankName: '阅读理解导入',
  stem: 'Read the passage and choose the best answer.',
  score: 2,
  passage: '',
  questionsText: ''
});

const questions = ref<any[]>([]);
const questionKeyword = ref('');
const questionType = ref('');
const questionMeta = reactive({ page: 1, pageSize: 20, total: 0 });
const questionDialog = ref(false);
const questionForm = reactive<any>({ id: '', type: 'single', typeLabel: '', stem: '', score: 0, answer: [], fillAnswerValue: [], fillMode: 'single', explanation: '', options: [], pythonAnswerMarkdown: '', passageId: '', readingPassage: '', activeReadingItemId: '', readingItems: [] as ReadingQuestionFormItem[] });
const renderedPythonAnswer = computed(() => renderMarkdown(questionForm.pythonAnswerMarkdown || ''));
const status = ref<any>({});

const orderedTree = computed(() => {
  return [...tree.value]
    .sort((a: any, b: any) => {
      const sortDiff = (a.sortOrder || 0) - (b.sortOrder || 0);
      if (sortDiff !== 0) return sortDiff;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    })
    .map((subject: any) => ({
      ...subject,
      banks: [...(subject.banks || [])].sort((a: any, b: any) => {
        const sortDiff = (a.sortOrder || 0) - (b.sortOrder || 0);
        if (sortDiff !== 0) return sortDiff;
        return String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id || '').localeCompare(String(b.id || ''));
      })
    }));
});

const filteredTree = computed(() => {
  const keyword = treeKeyword.value.trim();
  if (!keyword) return orderedTree.value;
  return orderedTree.value
    .map((subject) => ({
      ...subject,
      banks: subject.banks.filter((bank: BankNode) => bank.name.includes(keyword))
    }))
    .filter((subject) => subject.name.includes(keyword) || subject.banks.length > 0);
});

const canDragSubjects = computed(() => !treeKeyword.value.trim() && orderedTree.value.length > 1 && !subjectOrdering.value);

function canDragBanks(subject: SubjectNode) {
  return !treeKeyword.value.trim() && subject.banks.length > 1 && !subjectOrdering.value && !bankOrdering.value;
}

const currentTitle = computed(() => {
  if (selectedBank.value && selectedSubject.value) return `${selectedSubject.value.name} / ${selectedBank.value.name}`;
  if (selectedSubject.value) return selectedSubject.value.name;
  return '未选择科目或题库';
});

const currentSubTitle = computed(() => {
  if (selectedBank.value) return `${selectedBank.value.questionCount} 道题，当前操作默认作用于这个题库`;
  if (selectedSubject.value) return `${selectedSubject.value.banks.length} 个题库，当前操作默认作用于这个科目`;
  return '请在左侧选择，或直接粘贴完整 QandA JSON 自动导入';
});

const importSummary = computed(() => {
  if (!lastImport.value) return '';
  const subject = lastImport.value.subject?.name || '-';
  const bank = lastImport.value.bank?.name || '-';
  return `科目：${subject}；题库：${bank}；新增：${lastImport.value.createdCount ?? 0}；更新：${lastImport.value.updatedCount ?? 0}；共处理：${lastImport.value.questionCount ?? 0}`;
});

type ReadingOptionDraft = { label: string; text: string };
type ReadingQuestionDraft = {
  number: string;
  question: string;
  answer: string;
  options: ReadingOptionDraft[];
  explanation: string;
};
type ReadingQuestionFormItem = {
  id: string;
  localId: string;
  readingQuestion: string;
  answer: string;
  options: Array<{ label: string; content: string }>;
  explanation: string;
};

async function loadTree() {
  tree.value = await api.get<SubjectNode[]>('/admin/tree');

  if (!hasInitializedExpansion.value) {
    expandedSubjectIds.value = tree.value.map((subject) => subject.id);
    hasInitializedExpansion.value = true;
  } else {
    const validIds = new Set(tree.value.map((subject) => subject.id));
    expandedSubjectIds.value = expandedSubjectIds.value.filter((id) => validIds.has(id));
  }

  if (selectedBank.value) {
    const subject = tree.value.find((item) => item.id === selectedSubject.value?.id);
    const bank = subject?.banks.find((item) => item.id === selectedBank.value?.id);
    if (subject && bank) selectBank(subject, bank, false);
  } else if (selectedSubject.value) {
    const subject = tree.value.find((item) => item.id === selectedSubject.value?.id);
    if (subject) selectSubject(subject, false);
  } else if (tree.value[0]) {
    selectSubject(tree.value[0], false);
  }
}

function isSubjectExpanded(subjectId: string) {
  return expandedSubjectIds.value.includes(subjectId);
}

function toggleSubject(subject: SubjectNode) {
  const exists = expandedSubjectIds.value.includes(subject.id);
  expandedSubjectIds.value = exists
    ? expandedSubjectIds.value.filter((id) => id !== subject.id)
    : [...expandedSubjectIds.value, subject.id];
}

function handleSubjectDragStart(subject: SubjectNode, event: DragEvent) {
  if (!canDragSubjects.value) {
    event.preventDefault();
    return;
  }
  draggingSubjectId.value = subject.id;
  dragOverSubjectId.value = '';
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', subject.id);
  }
}

function handleSubjectDragOver(subject: SubjectNode, event: DragEvent) {
  if (!draggingSubjectId.value || draggingSubjectId.value === subject.id || !canDragSubjects.value) return;
  dragOverSubjectId.value = subject.id;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function handleSubjectDragLeave(subject: SubjectNode) {
  if (dragOverSubjectId.value === subject.id) dragOverSubjectId.value = '';
}

async function handleSubjectDrop(targetSubject: SubjectNode) {
  const sourceId = draggingSubjectId.value;
  handleSubjectDragEnd();
  if (!sourceId || sourceId === targetSubject.id || !canDragSubjects.value) return;

  const ids = orderedTree.value.map((subject) => subject.id);
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetSubject.id);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const nextIds = [...ids];
  const [movedId] = nextIds.splice(sourceIndex, 1);
  nextIds.splice(targetIndex, 0, movedId);
  await saveSubjectOrder(nextIds);
}

function handleSubjectDragEnd() {
  draggingSubjectId.value = '';
  dragOverSubjectId.value = '';
}

function applySubjectOrder(ids: string[]) {
  const orderMap = new Map(ids.map((id, index) => [id, index]));
  tree.value = [...tree.value]
    .map((subject) => ({
      ...subject,
      sortOrder: orderMap.get(subject.id) ?? subject.sortOrder
    }))
    .sort((left, right) => {
      const leftOrder = orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

async function saveSubjectOrder(ids: string[]) {
  const previousIds = orderedTree.value.map((subject) => subject.id);
  applySubjectOrder(ids);
  subjectOrdering.value = true;
  try {
    await api.put('/admin/subjects/sort-order', { ids });
    ElMessage.success('科目排序已保存，答题端题库页会同步更新');
    await loadTree();
  } catch (error) {
    applySubjectOrder(previousIds);
    ElMessage.error(error instanceof Error ? error.message : '科目排序保存失败');
    await loadTree();
  } finally {
    subjectOrdering.value = false;
  }
}

function handleBankDragStart(subject: SubjectNode, bank: BankNode, event: DragEvent) {
  if (!canDragBanks(subject)) {
    event.preventDefault();
    return;
  }
  draggingBankId.value = bank.id;
  draggingBankSubjectId.value = subject.id;
  dragOverBankId.value = '';
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', bank.id);
  }
}

function handleBankDragOver(subject: SubjectNode, bank: BankNode, event: DragEvent) {
  if (
    !draggingBankId.value ||
    draggingBankId.value === bank.id ||
    draggingBankSubjectId.value !== subject.id ||
    !canDragBanks(subject)
  ) return;
  dragOverBankId.value = bank.id;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function handleBankDragLeave(bank: BankNode) {
  if (dragOverBankId.value === bank.id) dragOverBankId.value = '';
}

async function handleBankDrop(subject: SubjectNode, targetBank: BankNode) {
  const sourceId = draggingBankId.value;
  const sourceSubjectId = draggingBankSubjectId.value;
  handleBankDragEnd();
  if (!sourceId || sourceId === targetBank.id || sourceSubjectId !== subject.id || !canDragBanks(subject)) return;

  const currentSubject = orderedTree.value.find((item) => item.id === subject.id);
  const bankRows: BankNode[] = currentSubject?.banks || subject.banks;
  const ids = bankRows.map((bank) => bank.id);
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetBank.id);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const nextIds = [...ids];
  const [movedId] = nextIds.splice(sourceIndex, 1);
  nextIds.splice(targetIndex, 0, movedId);
  await saveBankOrder(subject.id, nextIds);
}

function handleBankDragEnd() {
  draggingBankId.value = '';
  draggingBankSubjectId.value = '';
  dragOverBankId.value = '';
}

function applyBankOrder(subjectId: string, ids: string[]) {
  const orderMap = new Map(ids.map((id, index) => [id, index]));
  tree.value = tree.value.map((subject) => {
    if (subject.id !== subjectId) return subject;
    return {
      ...subject,
      banks: [...subject.banks]
        .map((bank) => ({
          ...bank,
          sortOrder: orderMap.get(bank.id) ?? bank.sortOrder
        }))
        .sort((left, right) => {
          const leftOrder = orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder;
        })
    };
  });
}

async function saveBankOrder(subjectId: string, ids: string[]) {
  const currentSubject = orderedTree.value.find((subject) => subject.id === subjectId);
  const previousBankRows: BankNode[] = currentSubject?.banks || [];
  const previousIds = previousBankRows.map((bank) => bank.id);
  applyBankOrder(subjectId, ids);
  bankOrdering.value = true;
  try {
    await api.put('/admin/banks/sort-order', { subjectId, ids });
    ElMessage.success('单元排序已保存，答题端题库页会同步更新');
    await loadTree();
  } catch (error) {
    if (previousIds.length) applyBankOrder(subjectId, previousIds);
    ElMessage.error(error instanceof Error ? error.message : '单元排序保存失败');
    await loadTree();
  } finally {
    bankOrdering.value = false;
  }
}

function applySubjectToForm(subject: SubjectNode) {
  Object.assign(subjectForm, {
    id: subject.id,
    name: subject.name,
    description: subject.description || '',
    color: subject.color || '#5b8def',
    isActive: subject.isActive
  });
}

function applyBankToForm(bank: BankNode) {
  Object.assign(bankForm, { id: bank.id, name: bank.name, description: bank.description || '', isActive: bank.isActive });
}

function handleSubjectModeChange() {
  if (subjectMode.value === 'create') {
    resetSubjectForm();
    return;
  }
  if (selectedSubject.value) {
    applySubjectToForm(selectedSubject.value);
  } else {
    resetSubjectForm();
  }
}

function handleBankModeChange() {
  if (bankMode.value === 'create') {
    resetBankForm();
    return;
  }
  if (selectedBank.value) {
    applyBankToForm(selectedBank.value);
  } else {
    resetBankForm();
  }
}

function selectSubject(subject: SubjectNode, changeTab = true) {
  selectedSubject.value = subject;
  selectedBank.value = null;
  selectedType.value = 'subject';
  subjectMode.value = 'edit';
  bankMode.value = 'create';
  if (!isSubjectExpanded(subject.id)) expandedSubjectIds.value = [...expandedSubjectIds.value, subject.id];
  applySubjectToForm(subject);
  resetBankForm();
  if (changeTab) activeTab.value = 'structure';
}

function selectBank(subject: SubjectNode, bank: BankNode, changeTab = true) {
  selectedSubject.value = subject;
  selectedBank.value = bank;
  selectedType.value = 'bank';
  subjectMode.value = 'edit';
  bankMode.value = 'edit';
  if (!isSubjectExpanded(subject.id)) expandedSubjectIds.value = [...expandedSubjectIds.value, subject.id];
  applySubjectToForm(subject);
  applyBankToForm(bank);
  questionMeta.page = 1;
  loadQuestions();
  if (changeTab) activeTab.value = 'import';
}

function resetSubjectForm() {
  Object.assign(subjectForm, { id: '', name: '', description: '', color: '#5b8def', isActive: true });
}

function resetBankForm() {
  Object.assign(bankForm, { id: '', name: '', description: '', isActive: true });
}

async function saveSubject() {
  if (!subjectForm.name.trim()) return ElMessage.warning('请输入科目名称');
  if (subjectMode.value === 'edit' && !subjectForm.id) return ElMessage.warning('请先选择要修改的科目');
  const payload = { name: subjectForm.name.trim(), description: subjectForm.description, color: subjectForm.color, isActive: subjectForm.isActive };
  const saved = subjectMode.value === 'edit' ? await api.put<any>(`/admin/subjects/${subjectForm.id}`, payload) : await api.post<any>('/admin/subjects', payload);
  ElMessage.success(subjectMode.value === 'edit' ? '科目修改已保存' : '科目已新增');
  subjectMode.value = 'edit';
  await loadTree();
  const subject = tree.value.find((item) => item.id === saved.id);
  if (subject) selectSubject(subject, false);
}

async function deleteSubject() {
  if (subjectMode.value !== 'edit' || !subjectForm.id) return;
  await ElMessageBox.confirm('删除科目会同时删除该科目下所有题库和题目，确认继续？', '危险操作');
  await api.delete(`/admin/subjects/${subjectForm.id}`);
  ElMessage.success('科目已删除');
  selectedSubject.value = null;
  selectedBank.value = null;
  subjectMode.value = 'create';
  bankMode.value = 'create';
  resetSubjectForm();
  resetBankForm();
  await loadTree();
}

async function saveBank() {
  if (!selectedSubject.value) return ElMessage.warning('请先选择科目');
  if (!bankForm.name.trim()) return ElMessage.warning('请输入题库名称');
  if (bankMode.value === 'edit' && !bankForm.id) return ElMessage.warning('请先选择要修改的题库');
  const payload = { subjectId: selectedSubject.value.id, name: bankForm.name.trim(), description: bankForm.description, isActive: bankForm.isActive };
  const saved = bankMode.value === 'edit' ? await api.put<any>(`/admin/banks/${bankForm.id}`, payload) : await api.post<any>('/admin/banks', payload);
  ElMessage.success(bankMode.value === 'edit' ? '题库修改已保存' : '题库已新增');
  bankMode.value = 'edit';
  await loadTree();
  const subject = tree.value.find((item) => item.id === selectedSubject.value?.id);
  const bank = subject?.banks.find((item) => item.id === saved.id);
  if (subject && bank) selectBank(subject, bank, false);
}

async function deleteBank() {
  if (bankMode.value !== 'edit' || !bankForm.id) return;
  await ElMessageBox.confirm('删除题库会同时删除其中所有题目，确认继续？', '危险操作');
  await api.delete(`/admin/banks/${bankForm.id}`);
  ElMessage.success('题库已删除');
  selectedBank.value = null;
  bankMode.value = 'create';
  resetBankForm();
  await loadTree();
}

function fillReadingSample() {
  readingImport.subjectName = selectedSubject.value?.name || '大学英语阅读理解';
  readingImport.bankName = selectedBank.value?.name || 'Passage One 阅读理解';
  readingImport.stem = 'Passage One. Read the passage and choose the best answer.';
  readingImport.score = 2;
  readingImport.passage = `Passage One

New research suggests that pandas may be at risk of dying out because they are too comfortable. Experts say too much happiness can stop the bears from searching for new mates.

Environmentalists have long believed that building roads or homes near the bears may threaten their survival by “reducing or fragmenting their natural habitats”. But the new research suggests that a modest degree of discomfort and fragmentation may actually help preserve panda populations.`;
  readingImport.questionsText = `1. What do we learn from new research about pandas? D
A. They are losing habitat due to the building of roads and houses.
B. They have stopped seeking new mates for reproduction.
C. They may not adapt to the fragmentation of their habitat.
D. They may cease to exist as a result of enjoying too good a life.
解析：The opening paragraph says pandas may risk dying out because they are too comfortable.

2. What can we conclude from the new research? A
A. Environmentalists’ long-time belief regarding panda conservation may be misleading.
B. Housing development near pandas’ homes may threaten their survival.
C. Pandas’ natural habitats are becoming less suitable for reproduction.
D. The increased panda population is attributed to the fragmentation of their habitat.
解析：The passage contrasts the old belief with the new finding that modest fragmentation may help.`;
}

function extractReadingAnswer(text: string) {
  const match = text.match(/\s+(?:(?:答案|正确答案|Answer|Correct answer)\s*[:：]?\s*)?([A-Ha-h])\s*$/);
  if (!match || match.index === undefined) return { text: text.trim(), answer: '' };
  return {
    text: text.slice(0, match.index).trim(),
    answer: match[1].toUpperCase()
  };
}

function parseReadingQuestionsText(input: string): ReadingQuestionDraft[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const items: ReadingQuestionDraft[] = [];
  let current: ReadingQuestionDraft | null = null;
  let activeOption: ReadingOptionDraft | null = null;
  let readingExplanation = false;

  function pushCurrent() {
    if (!current) return;
    current.question = current.question.replace(/\s+/g, ' ').trim();
    current.explanation = current.explanation.trim();
    current.options = current.options.map((option) => ({
      label: option.label,
      text: option.text.replace(/\s+/g, ' ').trim()
    }));
    const title = `第 ${current.number} 题`;
    if (!current.question) throw new Error(`${title} 缺少小题题干`);
    if (current.options.length < 2) throw new Error(`${title} 至少需要 2 个选项`);
    if (!current.answer) throw new Error(`${title} 缺少正确答案，请写在题干末尾或单独写“答案：A”`);
    if (!current.options.some((option) => option.label === current!.answer)) {
      throw new Error(`${title} 的正确答案 ${current.answer} 没有对应选项`);
    }
    items.push(current);
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const questionMatch = line.match(/^(\d+)[\.．、\)]\s*(.+)$/);
    if (questionMatch) {
      pushCurrent();
      const extracted = extractReadingAnswer(questionMatch[2]);
      current = {
        number: questionMatch[1],
        question: extracted.text,
        answer: extracted.answer,
        options: [],
        explanation: ''
      };
      activeOption = null;
      readingExplanation = false;
      return;
    }

    if (!current) {
      throw new Error('小题文本需要从“1. 题干 答案”开始');
    }

    const answerMatch = line.match(/^(?:答案|正确答案|Answer|Correct answer)\s*[:：]?\s*([A-Ha-h])\s*$/);
    if (answerMatch) {
      current.answer = answerMatch[1].toUpperCase();
      activeOption = null;
      readingExplanation = false;
      return;
    }

    const explanationMatch = line.match(/^(?:解析|Explanation|Analysis)\s*[:：]\s*(.*)$/i);
    if (explanationMatch) {
      current.explanation = [current.explanation, explanationMatch[1].trim()].filter(Boolean).join('\n');
      activeOption = null;
      readingExplanation = true;
      return;
    }

    const optionMatch = line.match(/^([A-Ha-h])[\.\)．、]\s*(.+)$/);
    if (optionMatch) {
      const option = { label: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() };
      current.options.push(option);
      activeOption = option;
      readingExplanation = false;
      return;
    }

    if (readingExplanation) {
      current.explanation = [current.explanation, line].filter(Boolean).join('\n');
    } else if (activeOption) {
      activeOption.text = `${activeOption.text} ${line}`.trim();
    } else {
      current.question = `${current.question} ${line}`.trim();
    }
  });

  pushCurrent();
  if (!items.length) throw new Error('没有解析到阅读理解小题');
  return items;
}

function safeLegacyId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildReadingImportPayload() {
  const passage = readingImport.passage.trim();
  if (!passage) throw new Error('请先填写阅读原文');

  const subjectName = selectedSubject.value?.name || readingImport.subjectName.trim();
  const bankName = selectedBank.value?.name || readingImport.bankName.trim();
  if (!selectedSubject.value && !subjectName) throw new Error('未选择科目时，需要填写科目名称');
  if (!selectedBank.value && !bankName) throw new Error('未选择题库时，需要填写题库名称');

  const items = parseReadingQuestionsText(readingImport.questionsText);
  const stem = readingImport.stem.trim() || 'Read the passage and choose the best answer.';
  const idPrefix = safeLegacyId(`${bankName}-${Date.now().toString(36)}`) || `reading-${Date.now().toString(36)}`;
  const passageId = idPrefix;

  return {
    version: 1,
    source: '阅读理解快捷导入',
    subject: {
      id: selectedSubject.value?.legacyId || safeLegacyId(subjectName),
      name: subjectName,
      color: selectedSubject.value?.color || '#5b8def'
    },
    unit: {
      id: selectedBank.value?.legacyId || safeLegacyId(bankName),
      name: bankName,
      description: '阅读理解快捷导入'
    },
    questions: items.map((item, index) => ({
      id: `${idPrefix}-${String(index + 1).padStart(3, '0')}`,
      type: 'reading',
      typeLabel: '阅读理解',
      score: Number(readingImport.score || 0),
      passageId,
      question: stem,
      readingPassage: passage,
      readingQuestion: item.question,
      options: item.options.map((option) => ({ key: option.label, text: option.text })),
      answer: item.answer,
      explanation: item.explanation
    }))
  };
}

function generateReadingJson() {
  try {
    jsonText.value = JSON.stringify(buildReadingImportPayload(), null, 2);
    importMode.value = 'json';
    ElMessage.success('已生成阅读理解 JSON，可检查后导入');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '生成失败');
  }
}

async function finishImport(result: any) {
  lastImport.value = result;
  ElMessage.success(`导入成功：新增 ${result.createdCount ?? 0}，更新 ${result.updatedCount ?? 0}`);
  await loadTree();
  const subject = tree.value.find((item) => item.id === result.subject?.id);
  const bank = subject?.banks.find((item) => item.id === result.bank?.id);
  if (subject && bank) selectBank(subject, bank, false);
}

async function submitReadingImport() {
  importing.value = true;
  try {
    const payload = buildReadingImportPayload();
    const result = await api.post<any>('/admin/import/json', {
      payload,
      subjectId: selectedSubject.value?.id,
      bankId: selectedBank.value?.id
    });
    await finishImport(result);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败');
  } finally {
    importing.value = false;
  }
}

function fillSample() {
  jsonText.value = JSON.stringify({
    version: 1,
    source: 'QandA 导出',
    subject: { id: 'demo-subject', name: '演示科目', description: '', color: '#5b8def' },
    unit: { id: 'demo-unit', name: '填空题示例', description: '' },
    questions: [
      {
        id: 'demo-vocab-001',
        type: 'fill',
        typeLabel: '词汇填空',
        difficulty: 'easy',
        tags: ['演示', '词汇'],
        score: 1,
        question: '充分地；足够地\n\n请写出对应的英文候选词 / 短语。',
        blanks: [
          { label: '1', answer: ['adequately'], pronunciation: { text: 'adequately', lang: 'en-US' } }
        ],
        explanation: '正确词汇：adequately\n中文记忆：充分地；足够地'
      },
      {
        id: 'demo-science-001',
        type: 'fill',
        typeLabel: '多空填空',
        difficulty: 'medium',
        tags: ['演示', '通用学科'],
        score: 2,
        question: '水的化学式是____，标准大气压下沸点约为____摄氏度。',
        blanks: [
          { label: '1', prompt: '化学式', answer: ['H2O', 'H₂O'] },
          { label: '2', prompt: '温度', answer: ['100', '一百'] }
        ],
        explanation: '解析支持 **Markdown**：水分子由 2 个氢原子和 1 个氧原子组成；标准大气压下沸点约为 100 摄氏度。'
      }
    ]
  }, null, 2);
}

function clearImport() {
  jsonText.value = '';
  lastImport.value = null;
}

function handleFile() {
  return false;
}

function handleFileChange(uploadFile: any) {
  const file = uploadFile.raw as File | undefined;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    jsonText.value = String(reader.result || '');
    ElMessage.success('文件内容已读取到文本框');
  };
  reader.readAsText(file, 'utf-8');
  uploadRef.value?.clearFiles?.();
}

async function submitImport() {
  if (!jsonText.value.trim()) return ElMessage.warning('请先粘贴或上传 JSON');
  importing.value = true;
  try {
    const payload = JSON.parse(jsonText.value);
    const result = await api.post<any>('/admin/import/json', {
      payload,
      subjectId: selectedSubject.value?.id,
      bankId: selectedBank.value?.id
    });
    await finishImport(result);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败');
  } finally {
    importing.value = false;
  }
}

function afterImportViewQuestions() {
  activeTab.value = 'questions';
  loadQuestions();
}


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

function questionTypeLabel(questionOrType: any) {
  const type = typeof questionOrType === 'object' && questionOrType !== null ? questionOrType.type : questionOrType;
  const customLabel = typeof questionOrType === 'object' && questionOrType !== null ? String(questionOrType.typeLabel || '').trim() : '';
  if (customLabel) return customLabel;
  return ({ single: '单选', multiple: '多选', judge: '判断', fill: '填空', python: 'Python题', reading: '阅读理解' } as Record<string, string>)[type] || type || '题目';
}

function questionAnswerSummary(row: any) {
  if (row.type === 'python') return 'Markdown答案';
  if (Array.isArray(row.answerJson) && row.answerJson.some((item: any) => Array.isArray(item))) {
    return row.answerJson.map((item: any) => Array.isArray(item) ? item.join(' / ') : String(item)).join('；');
  }
  return Array.isArray(row.answerJson) ? row.answerJson.join('、') : '';
}

function resetPythonQuestionAnswer() {
  if (!questionForm.pythonAnswerMarkdown) {
    questionForm.pythonAnswerMarkdown = '### 参考答案\n\n```python\n# 在这里填写正确答案代码\nprint("hello")\n```\n\n### 答案解析\n\n这里填写解题思路。';
  }
}

function normalizedQuestionTypeLabel() {
  if (questionForm.type !== 'python') return '';
  const label = String(questionForm.typeLabel || '').trim();
  return label === 'Python题' ? '' : label;
}

function fillQuestionAnswerArray() {
  return normalizeFillAnswerPayload(questionForm.fillAnswerValue, questionForm.fillMode);
}

function nextReadingLocalId() {
  return `reading-item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultReadingOptions() {
  return ['A', 'B', 'C', 'D'].map((label) => ({ label, content: '' }));
}

function createReadingQuestionItem(partial: Partial<ReadingQuestionFormItem> = {}): ReadingQuestionFormItem {
  return {
    id: partial.id || '',
    localId: partial.localId || nextReadingLocalId(),
    readingQuestion: partial.readingQuestion || '',
    answer: partial.answer || '',
    options: (partial.options && partial.options.length ? partial.options : defaultReadingOptions())
      .map((option) => ({ label: String(option.label || '').trim(), content: String(option.content || '') })),
    explanation: partial.explanation || ''
  };
}

function generateReadingPassageId() {
  const base = safeLegacyId([
    selectedBank.value?.legacyId || selectedBank.value?.name || 'reading',
    Date.now().toString(36)
  ].filter(Boolean).join('-'));
  return base || `reading-${Date.now().toString(36)}`;
}

function ensureReadingQuestionItems() {
  if (!Array.isArray(questionForm.readingItems) || questionForm.readingItems.length === 0) {
    const item = createReadingQuestionItem();
    questionForm.readingItems = [item];
    questionForm.activeReadingItemId = item.localId;
  } else if (!questionForm.readingItems.some((item: ReadingQuestionFormItem) => item.localId === questionForm.activeReadingItemId)) {
    questionForm.activeReadingItemId = questionForm.readingItems[0].localId;
  }
}

function addReadingQuestionItem() {
  ensureReadingQuestionItems();
  const item = createReadingQuestionItem();
  questionForm.readingItems.push(item);
  questionForm.activeReadingItemId = item.localId;
}

function duplicateReadingQuestionItem(index: number) {
  const source = questionForm.readingItems[index];
  if (!source) return;
  const item = createReadingQuestionItem({
    readingQuestion: source.readingQuestion,
    answer: source.answer,
    options: source.options.map((option: any) => ({ label: option.label, content: option.content })),
    explanation: source.explanation
  });
  questionForm.readingItems.splice(index + 1, 0, item);
  questionForm.activeReadingItemId = item.localId;
}

function removeReadingQuestionItem(index: number) {
  if (questionForm.readingItems.length <= 1) return;
  const removed = questionForm.readingItems[index];
  questionForm.readingItems.splice(index, 1);
  if (removed?.localId === questionForm.activeReadingItemId) {
    const next = questionForm.readingItems[Math.min(index, questionForm.readingItems.length - 1)];
    questionForm.activeReadingItemId = next?.localId || '';
  }
}

function addReadingQuestionOption(item: ReadingQuestionFormItem) {
  const label = String.fromCharCode(65 + item.options.length);
  item.options.push({ label, content: '' });
}

function normalizedReadingQuestionItems() {
  ensureReadingQuestionItems();
  return questionForm.readingItems.map((item: ReadingQuestionFormItem, index: number) => {
    const readingQuestion = String(item.readingQuestion || '').trim();
    const options = (item.options || [])
      .map((option) => ({ label: String(option.label || '').trim(), content: String(option.content || '') }))
      .filter((option) => option.label && option.content.trim());
    const answer = String(item.answer || '').trim();
    if (!readingQuestion) throw new Error(`第 ${index + 1} 道小题缺少题干`);
    if (options.length < 2) throw new Error(`第 ${index + 1} 道小题至少需要 2 个选项`);
    if (new Set(options.map((option) => option.label)).size !== options.length) throw new Error(`第 ${index + 1} 道小题选项标识不能重复`);
    if (!answer) throw new Error(`第 ${index + 1} 道小题缺少正确答案`);
    if (!options.some((option) => option.label === answer)) throw new Error(`第 ${index + 1} 道小题正确答案必须对应已有选项`);
    return {
      id: item.id || undefined,
      readingQuestion,
      options,
      answer,
      explanation: String(item.explanation || '')
    };
  });
}

async function loadQuestions() {
  if (!selectedBank.value) return;
  const qs = new URLSearchParams({ page: String(questionMeta.page), pageSize: String(questionMeta.pageSize), bankId: selectedBank.value.id });
  if (questionKeyword.value.trim()) qs.set('keyword', questionKeyword.value.trim());
  if (questionType.value) qs.set('type', questionType.value);
  const data = await api.get<any>(`/admin/questions?${qs}`);
  questions.value = data.rows || [];
  Object.assign(questionMeta, data.meta);
}

function openQuestionCreate() {
  if (!selectedBank.value) return ElMessage.warning('请先选择题库');
  const readingItem = createReadingQuestionItem();
  Object.assign(questionForm, {
    id: '',
    type: 'single',
    typeLabel: '',
    stem: '',
    score: 0,
    answer: [],
    fillAnswerValue: [],
    fillMode: 'single',
    explanation: '',
    options: [{ label: 'A', content: '' }, { label: 'B', content: '' }],
    pythonAnswerMarkdown: '',
    passageId: '',
    readingPassage: '',
    activeReadingItemId: readingItem.localId,
    readingItems: [readingItem]
  });
  questionDialog.value = true;
}

async function openQuestionEdit(row: any) {
  const rowAnswer = Array.isArray(row.answerJson) ? row.answerJson : [];
  const multiFill = isMultiFillAnswer(rowAnswer);
  const raw = row.rawJson && typeof row.rawJson === 'object' ? row.rawJson : {};
  let readingRows = row.type === 'reading' ? [row] : [];
  if (row.type === 'reading' && raw.passageId && row.bankId) {
    try {
      readingRows = await api.get<any[]>(`/admin/reading-passages/${encodeURIComponent(String(raw.passageId))}?bankId=${encodeURIComponent(row.bankId)}`);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '阅读理解短文读取失败');
      return;
    }
  }
  const readingItems = row.type === 'reading'
    ? readingRows.map((item: any) => {
        const itemRaw = item.rawJson && typeof item.rawJson === 'object' ? item.rawJson : {};
        const itemAnswer = Array.isArray(item.answerJson) ? item.answerJson : [];
        return createReadingQuestionItem({
          id: item.id,
          readingQuestion: String(itemRaw.readingQuestion || ''),
          answer: String(itemAnswer[0] || ''),
          options: (item.options || []).map((option: any) => ({ label: option.label, content: option.content })),
          explanation: item.explanation || ''
        });
      })
    : [createReadingQuestionItem()];
  Object.assign(questionForm, {
    id: row.id,
    type: row.type,
    typeLabel: row.typeLabel || '',
    stem: row.stem,
    score: row.score,
    answer: rowAnswer,
    fillAnswerValue: row.type === 'fill' ? normalizeFillAnswerPayload(rowAnswer, multiFill ? 'multi' : 'single') : [],
    fillMode: multiFill ? 'multi' : 'single',
    explanation: row.explanation || '',
    options: (row.options || []).map((option: any) => ({ label: option.label, content: option.content })),
    pythonAnswerMarkdown: row.type === 'python' ? String(rowAnswer[0] || '') : '',
    passageId: row.type === 'reading' ? String(raw.passageId || '') : '',
    readingPassage: row.type === 'reading' ? String(raw.readingPassage || '') : '',
    activeReadingItemId: readingItems[0]?.localId || '',
    readingItems
  });
  if (questionForm.type === 'judge') applyJudgeQuestionOptions();
  questionDialog.value = true;
}

function applyJudgeQuestionOptions() {
  questionForm.options = [{ label: 'A', content: '正确' }, { label: 'B', content: '错误' }];
  questionForm.answer = questionForm.answer
    .map((item: string) => {
      const text = String(item).trim().toLowerCase();
      if (['a', 'true', '正确', '对', '是', '1'].includes(text)) return 'A';
      if (['b', 'false', '错误', '错', '否', '0'].includes(text)) return 'B';
      return item;
    })
    .filter((item: string) => item === 'A' || item === 'B')
    .slice(0, 1);
}

function ensureQuestionChoiceOptions() {
  if (!Array.isArray(questionForm.options) || questionForm.options.length === 0) {
    questionForm.options = [{ label: 'A', content: '' }, { label: 'B', content: '' }];
  }
}

function addQuestionOption() {
  if (questionForm.type === 'judge') return applyJudgeQuestionOptions();
  ensureQuestionChoiceOptions();
  const label = String.fromCharCode(65 + questionForm.options.length);
  questionForm.options.push({ label, content: '' });
}

async function saveQuestion() {
  if (!selectedBank.value) return ElMessage.warning('请先选择题库');
  if (!questionForm.stem.trim()) return ElMessage.warning('请输入题干');
  if (questionForm.type === 'python' && !String(questionForm.pythonAnswerMarkdown || '').trim()) return ElMessage.warning('请输入正确答案 Markdown');
  if (questionForm.type === 'reading' && !String(questionForm.readingPassage || '').trim()) return ElMessage.warning('请输入阅读理解原文');
  if (questionForm.type === 'fill' && fillQuestionAnswerArray().length === 0) return ElMessage.warning('请至少填写一个正确答案');
  if (questionForm.type === 'reading') {
    try {
      if (!String(questionForm.passageId || '').trim()) questionForm.passageId = generateReadingPassageId();
      await api.post('/admin/reading-passages', {
        bankId: selectedBank.value.id,
        stem: questionForm.stem,
        score: Number(questionForm.score || 0),
        passageId: questionForm.passageId,
        readingPassage: questionForm.readingPassage,
        questions: normalizedReadingQuestionItems()
      });
      ElMessage.success('阅读理解已保存');
      questionDialog.value = false;
      await loadQuestions();
      await loadTree();
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '保存失败');
    }
    return;
  }
  const payload = questionForm.type === 'python'
    ? {
        bankId: selectedBank.value.id,
        type: questionForm.type,
        typeLabel: normalizedQuestionTypeLabel(),
        stem: questionForm.stem,
        score: Number(questionForm.score || 0),
        answer: [questionForm.pythonAnswerMarkdown],
        explanation: '',
        options: []
      }
    : questionForm.type === 'fill'
      ? {
          bankId: selectedBank.value.id,
          type: questionForm.type,
          typeLabel: '',
          stem: questionForm.stem,
          score: Number(questionForm.score || 0),
          answer: fillQuestionAnswerArray(),
          explanation: questionForm.explanation,
          options: []
        }
    : {
        bankId: selectedBank.value.id,
        type: questionForm.type,
        typeLabel: '',
        stem: questionForm.stem,
        score: Number(questionForm.score || 0),
        answer: questionForm.answer,
        explanation: questionForm.explanation,
        options: questionForm.options
      };
  questionForm.id ? await api.put(`/admin/questions/${questionForm.id}`, payload) : await api.post('/admin/questions', payload);
  ElMessage.success('题目已保存');
  questionDialog.value = false;
  await loadQuestions();
  await loadTree();
}

async function deleteQuestion(id: string) {
  await ElMessageBox.confirm('确认删除这道题？', '危险操作');
  await api.delete(`/admin/questions/${id}`);
  ElMessage.success('题目已删除');
  await loadQuestions();
  await loadTree();
}

async function clearCurrentBankQuestions() {
  if (!selectedBank.value) return ElMessage.warning('请先选择题库/单元');
  const total = questionMeta.total || selectedBank.value.questionCount || questions.value.length;
  if (total <= 0) return ElMessage.info('当前单元暂无题目可清空');
  await ElMessageBox.confirm(
    `确认删除「${selectedBank.value.name}」下的全部 ${total} 道题目？此操作不可恢复。`,
    '清空当前单元题目',
    {
      confirmButtonText: '确认清空',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    }
  );
  const result = await api.delete<{ deletedCount: number }>(`/admin/banks/${selectedBank.value.id}/questions`);
  ElMessage.success(`已清空 ${result.deletedCount ?? total} 道题目`);
  questionMeta.page = 1;
  await loadQuestions();
  await loadTree();
}

async function loadStatus() {
  status.value = await api.get('/admin/system/status');
}

watch(() => questionForm.type, (type) => {
  if (type === 'judge') applyJudgeQuestionOptions();
  if (type === 'python') {
    resetPythonQuestionAnswer();
    if (!String(questionForm.typeLabel || '').trim()) questionForm.typeLabel = 'Python题';
  } else {
    questionForm.typeLabel = '';
  }
  if (type === 'fill') {
    questionForm.options = [];
    questionForm.answer = [];
    if (!questionForm.fillMode) questionForm.fillMode = 'single';
  }
  if (type === 'single' || type === 'multiple') ensureQuestionChoiceOptions();
  if (type === 'reading') {
    questionForm.options = [];
    questionForm.answer = [];
    if (!String(questionForm.passageId || '').trim()) questionForm.passageId = generateReadingPassageId();
    ensureReadingQuestionItems();
  }
});

onMounted(async () => {
  await loadTree();
  await loadStatus();
});
</script>
