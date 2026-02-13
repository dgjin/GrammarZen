# GrammarZen 中文智能校对系统设计说明书

**版本**: 1.1.0
**日期**: 2024-05-22
**项目名称**: GrammarZen (中文智能校对)

---

## 1. 引言

### 1.1 项目背景
在日常写作、办公文档处理及内容创作中，中文文本经常出现错别字、语法错误、标点误用及文风不统一等问题。GrammarZen 旨在利用先进的大语言模型（Google Gemini）能力，提供一个轻量级、高精度的在线中文校对工具。

### 1.2 系统目标
*   **多模态输入**：支持纯文本、Word 文档 (.docx)、PDF 及图片输入。
*   **双模式校对**：提供“快速模式”与“专业深度模式”以适应不同场景。
*   **内容合规校验**：识别敏感词、广告法违禁词（如“最高级”）、政治敏感及低俗内容。
*   **结构化输出**：不仅提供修改后的文本，还需提供详细的错误分类、原因分析及修订对比（Diff）。
*   **用户友好**：提供直观的修订对比视图、问题卡片和一键导出功能。

---

## 2. 系统架构设计

### 2.1 技术栈
本系统采用 **Client-Side Rendering (CSR)** 架构，直接由前端与 AI 服务进行交互。

*   **前端框架**: React 19
*   **UI 框架**: Tailwind CSS (原子化 CSS)
*   **图标库**: Lucide React
*   **AI 核心**: Google Gemini API (`gemini-3-flash-preview`)
*   **工具库**:
    *   `mammoth`: 用于解析 .docx Word 文档。
    *   `diff`: 用于生成文本修订对比数据。
    *   `@google/genai`: Google 官方 Gemini SDK。

### 2.2 数据流向图

```mermaid
graph TD
    User[用户] -->|输入/上传| UI[React 前端界面 (App.tsx)]
    UI -->|解析文件| FileParser[文件解析器 (Mammoth/FileReader)]
    UI -->|请求校对| Service[Gemini 服务层 (geminiService.ts)]
    
    Service -->|API 调用| GeminiAPI[Google Gemini API]
    GeminiAPI -->|返回 JSON| Service
    
    Service -->|结构化结果| UI
    UI -->|渲染对比| DiffEngine[Diff 引擎 (diff库)]
    UI -->|导出报告| ExportMgr[导出模块]
```

---

## 3. 功能模块详细设计

### 3.1 输入处理模块 (`App.tsx`)
负责接收用户输入，包括文本输入和文件上传。

*   **文本输入**: 支持多行文本输入，自动调整高度。
*   **文件上传**:
    *   **Word (.docx)**: 使用 `mammoth.extractRawText` 在浏览器端提取纯文本。
    *   **PDF/图片**: 转换为 Base64 编码，利用 Gemini 的多模态能力直接进行视觉/文本识别。
    *   **限制**: 前端限制文件大小为 10MB，支持格式包括 `.pdf`, `.docx`, `.jpg`, `.png`, `.webp`。

### 3.2 AI 服务交互模块 (`services/geminiService.ts`)
系统的核心逻辑层，负责构建 Prompt 并调用 Google Gemini API。

*   **模型选择**: 固定使用 `gemini-3-flash-preview`，兼顾速度与成本。
*   **结构化输出 (Schema Enforcement)**: 强制模型返回严格的 JSON 格式，包含 `correctedText`, `summary`, `score`, `issues` 等字段。
*   **校对模式 (System Instruction)**:
    1.  **快速模式 (Fast)**: 侧重于通顺度、错别字及基础合规。
    2.  **专业深度模式 (Professional)**: 
        *   **CSC (拼写纠错)**: 音似、形似、依存句法分析。
        *   **合规审查**: 严格检查广告法违禁词（如“第一”、“顶级”）、政治敏感、色情暴力等不当内容。

### 3.3 结果展示模块 (`components/ResultView.tsx`)
负责将 AI 返回的结构化数据渲染为可视化的校对报告。

*   **双视图切换**:
    *   **阅读模式**: 仅显示校对后的干净文本。
    *   **修订模式**: 使用 `diff` 库对比原文与校对文，通过颜色（红删绿增）高亮差异。
*   **问题列表**:
    *   使用 `IssueCard` 组件展示单个问题。
    *   **分类过滤**: 支持按类型过滤：敏感/合规、错别字、语病、标点、风格。
    *   **视觉区分**: 敏感词使用醒目的玫瑰红色警告样式。
*   **质量评估**: 显示 0-100 的评分及一句话总结。

### 3.4 导出模块 (`components/ResultView.tsx`)
支持将结果导出到本地，便于用户二次编辑或归档。

*   **纯文本 (.txt)**: 仅导出校对后的文本。
*   **完整报告 (.md)**: 生成 Markdown 格式报告，包含元数据、评分、全文及详细的问题分析列表（含敏感词分析）。

---

## 4. 数据结构设计 (`types.ts`)

系统核心数据流依赖于以下 TypeScript 接口定义：

### 4.1 错误类型枚举 (`IssueType`)
```typescript
export enum IssueType {
  TYPO = 'typo',              // 错别字/音似/形似
  GRAMMAR = 'grammar',        // 语病/语法错误
  PUNCTUATION = 'punctuation',// 标点符号
  STYLE = 'style',            // 文风
  SUGGESTION = 'suggestion',  // 建议
  SENSITIVE = 'sensitive'     // 敏感/合规/广告法
}
```

### 4.2 校对结果实体 (`ProofreadResult`)
这是 API 返回的最终 JSON 结构：
```typescript
export interface ProofreadResult {
  correctedText: string; // 完整校对后文本
  summary: string;       // 质量总结
  score: number;         // 评分 (0-100)
  issues: Issue[];       // 问题列表数组
}

export interface Issue {
  original: string;   // 原文片段
  suggestion: string; // 修改建议
  reason: string;     // 修改原因
  type: IssueType;    // 错误类型
}
```

---

## 5. 核心流程说明

### 5.1 文本校对流程
1.  用户输入文本，点击“开始校对”。
2.  前端锁定界面状态为 `loading`。
3.  调用 `checkChineseText` 服务。
4.  Gemini API 根据 Prompt 指令（含合规要求）处理并返回 JSON。
5.  解析 JSON，若成功则渲染 `ResultView`，若失败（如网络错误）则显示 `Error` 状态。

### 5.2 Word 文档处理流程
1.  用户上传 `.docx` 文件。
2.  `handleFileUpload` 拦截事件，检测 MIME 类型。
3.  调用 `file.arrayBuffer()` 读取文件流。
4.  调用 `mammoth.extractRawText` 提取文本。
5.  将提取的纯文本自动填充至输入框，允许用户在校对前手动修改。

### 5.3 导出流程
1.  用户点击“导出”按钮。
2.  选择导出格式。
3.  前端根据当前 `result` 对象在内存中生成 Blob 对象。
4.  动态创建 `<a>` 标签触发浏览器下载行为。

---

## 6. 界面与交互体验设计 (UI/UX)

*   **视觉风格**: 采用 Slate (背景) + Brand Blue (主色) 的极简商务风格。
*   **合规警告**: 敏感词汇使用红色警告色（Rose/Red），与普通语病（Orange）和建议（Purple）区分。
*   **交互细节**:
    *   加载时按钮显示 Spinner 和扫描动画。
    *   上传文件后显示文件预览卡片。
    *   修订模式下，新增内容绿色高亮，删除内容红色删除线。

---

## 7. 异常处理

1.  **API Key 缺失**: 必须配置环境变量 `API_KEY`，否则抛出错误。
2.  **文件过大**: 前端拦截 >10MB 的文件。
3.  **网络超时/失败**: 捕获异常并在 UI 上展示友好的错误提示框。
4.  **模型幻觉/JSON 解析失败**: 虽然使用了 `responseSchema`，但若解析失败，会在 Console 记录错误并提示用户重试。

---

## 8. 未来规划

1.  **自定义合规词库**: 允许企业用户上传私有黑名单（如竞品名称）。
2.  **长文本分段 (Chunking)**: 支持超过 Token 上限的长文档。
3.  **流式响应 (Streaming)**: 优化长文本体验，实现边生成边显示。
4.  **后端代理**: 迁移 API 调用至后端以保护 API Key。
