# GrammarZen 系统详细设计说明书

**版本**: 1.7.1
**日期**: 2024-05-27

---

## 1. 系统架构设计

本系统采用 **Client-Side Rendering (CSR)** 与 **Backend-as-a-Service (BaaS)** 相结合的架构。前端负责界面交互、文件解析和 AI 逻辑调度，Supabase 负责用户认证、数据持久化和文件存储。

### 1.1 技术栈

| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端框架** | React 19 + TypeScript | 核心 UI 库，利用 Hooks 管理状态 |
| **构建工具** | Vite 5 | 高性能构建与热更新 |
| **样式库** | Tailwind CSS | 原子化 CSS，快速构建响应式界面 |
| **BaaS 服务** | Supabase | 提供 Auth (认证), Database (PG), Storage (存储) |
| **AI SDK** | @google/genai | Google Gemini 官方 SDK |
| **文件处理** | Mammoth, PDF.js | 浏览器端文档解析库 |
| **Diff 引擎** | jsdiff | 文本差异比对算法库 |

### 1.2 架构图

```mermaid
graph TD
    Client[浏览器端 (React)]
    
    subgraph Frontend Services
        Auth[AuthModal & Profile]
        Parser[File Parser (PDF/Word/RTF)]
        GeminiService[AI Service Layer]
        DiffEngine[Diff Renderer]
    end
    
    subgraph Supabase BaaS
        AuthService[GoTrue Auth]
        DB[(PostgreSQL)]
        Storage[Object Storage (Avatars)]
    end
    
    subgraph AI Providers
        GoogleAPI[Google Gemini API]
        DeepSeekAPI[DeepSeek API]
        SparkAPI[讯飞星火 API]
    end

    Client -->|交互/上传| FrontendServices
    Auth -->|登录/注册| AuthService
    GeminiService -->|校对请求| GoogleAPI
    GeminiService -->|校对请求| DeepSeekAPI
    GeminiService -->|校对请求| SparkAPI
    
    Client -->|同步配置/规则| DB
    Client -->|上传头像| Storage
    
    Parser -->|提取文本| GeminiService
    GeminiService -->|返回 JSON| DiffEngine
    DiffEngine -->|渲染结果| Client
```

---

## 2. 核心模块设计

### 2.1 AI 服务层 (`services/geminiService.ts`)
该模块是系统的核心，负责抹平不同 AI 模型之间的差异，提供统一的调用接口。

*   **多模型适配**:
    *   **Gemini**: 使用官方 SDK `generateContentStream`。
    *   **OpenAI 兼容模型 (DeepSeek/Spark)**: 封装 `fetch` 请求，处理 SSE (Server-Sent Events) 流式响应。
*   **Prompt 工程**:
    *   动态构建 System Instruction，根据 `CheckMode` 注入不同的角色设定（如“公文专家”、“合规审核员”）。
    *   动态注入用户配置：白名单、敏感词库、自定义规则库。
*   **JSON 鲁棒解析**:
    *   由于流式输出可能导致 JSON 不完整，实现了 `parsePartialJson` 算法，尽可能从残缺的字符串中提取已生成的 `correctedText` 和 `issues`，实现“边生成边渲染”。

### 2.2 数据持久化层 (`services/supabaseService.ts`)
负责与 Supabase 进行交互，管理用户数据。

*   **配置同步**:
    *   `loadUserConfig`: 登录时优先拉取云端数据；若云端为空（首次登录），则自动将本地 LocalStorage 数据同步至云端。
    *   `saveWhitelist` / `saveSensitiveWords`: 双写策略，同时更新本地和云端，确保离线可用性及在线同步。
*   **头像上传**:
    *   `uploadUserAvatar`: 将图片上传至 `avatars` 存储桶，通过 RLS 策略保证安全性，并返回公共访问 URL。

### 2.3 数据库设计 (Supabase PostgreSQL)

#### 表 1: `grammarzen_user_configs` (用户配置)
| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `user_id` | uuid | 主键，外键关联 `auth.users` |
| `whitelist` | jsonb | 白名单字符串数组 |
| `sensitive_words` | jsonb | 敏感词字符串数组 |
| `updated_at` | timestamp | 最后更新时间 |

#### 表 2: `grammarzen_rule_libraries` (规则库)
| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | uuid | 主键 |
| `user_id` | uuid | 外键关联 `auth.users` |
| `name` | text | 规则库名称 |
| `description` | text | 描述 |
| `rules` | jsonb | 规则详情数组 |
| `created_at` | bigint | 创建时间戳 |

#### 存储桶: `avatars`
*   **权限**: Public (公开读取)
*   **RLS 策略**:
    *   `SELECT`: 允许所有人 (public)。
    *   `INSERT/UPDATE/DELETE`: 仅允许 `auth.uid() = owner` (即仅限用户操作自己的文件)。

### 2.4 前端组件设计

*   **ResultView**:
    *   核心展示组件。
    *   实现复杂的 `diff` 逻辑：结合 `diffChars` 算法与 AI 返回的 `issues` 定位，支持在修订单中高亮显示具体错误点。
    *   实现双向滚动定位：点击右侧卡片左侧滚动，点击左侧文字右侧滚动。
*   **UserProfileModal**:
    *   管理用户资料。
    *   集成隐藏的 `<input type="file">` 实现头像点击上传交互。
*   **PDFProcessModal**:
    *   处理 PDF 分页预览与选择。
    *   使用 `pdfjs-dist` 在 Canvas 上渲染缩略图。

---

## 3. 安全性设计

1.  **RLS (Row Level Security)**:
    *   数据库表启用 RLS，配置 Policy 确保 `user_id = auth.uid()`，防止越权访问他人配置。
2.  **环境变量隔离**:
    *   敏感 Key (API Keys, Supabase Keys) 通过 `.env` 管理，构建时注入。
3.  **输入清洗**:
    *   尽管主要依赖 AI 处理，前端仍对上传文件类型和大小（10MB/2MB）进行严格校验。

---

## 4. 接口设计 (内部)

主要通过 TypeScript 接口定义数据结构：

```typescript
// 校对结果结构
interface ProofreadResult {
  correctedText: string;
  summary: string;
  score: number;
  issues: Issue[];
}

// 错误详情
interface Issue {
  original: string;
  suggestion: string;
  reason: string;
  type: IssueType; // typo, grammar, sensitive, etc.
}
```
