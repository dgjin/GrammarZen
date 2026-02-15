# GrammarZen 本地部署安装手册

**版本**: 1.7.1
**日期**: 2024-05-27

---

## 1. 环境准备

在开始部署之前，请确保您的开发环境满足以下要求：

*   **操作系统**: Windows, macOS, 或 Linux
*   **Node.js**: >= 18.0.0
*   **包管理器**: npm 或 yarn
*   **Git**: 用于克隆代码仓库

---

## 2. 获取代码

打开终端或命令行工具，执行以下命令克隆项目：

```bash
git clone <repository-url>
cd grammarzen
```

---

## 3. 安装依赖

使用 npm 安装项目依赖：

```bash
npm install
# 或者如果出现依赖冲突
npm install --legacy-peer-deps
```

---

## 4. Supabase 后端配置 (关键步骤)

本项目依赖 Supabase 提供用户登录、数据同步和文件存储功能。请按照以下步骤配置：

### 4.1 创建项目
1.  访问 [Supabase 官网](https://supabase.com/) 并注册/登录。
2.  点击 "New Project" 创建一个新项目。
3.  记录下项目的 **Project URL** 和 **API Key (anon/public)**。

### 4.2 执行数据库脚本
1.  在 Supabase 后台左侧菜单点击 **SQL Editor**。
2.  点击 "New query"。
3.  复制项目根目录下 `doc/db_schema.sql` 文件的所有内容。
4.  粘贴到 Supabase SQL 编辑器中。
5.  点击右下角的 **Run** 按钮。
    *   *成功标志*: 底部显示 "Success" 且没有报错。此操作将创建所需的数据表、开启 RLS 安全策略并创建 `avatars` 存储桶。

### 4.3 配置存储桶 (如果 SQL 执行未自动创建)
通常 SQL 脚本会自动处理，但如果头像上传失败，请手动检查：
1.  点击左侧 **Storage**。
2.  确认是否存在名为 `avatars` 的 Bucket。
3.  确认该 Bucket 的属性为 **Public Bucket**。

### 4.4 配置 Auth (可选)
1.  点击左侧 **Authentication** -> **Providers**。
2.  确保 **Email** 启用。
3.  (推荐开发环境) 关闭 **Confirm email**，这样注册后无需邮箱验证即可登录。

---

## 5. 环境变量配置

1.  在项目根目录复制 `.env` 模板（如果不存在，请新建）：

```bash
cp .env .env.local
```

2.  编辑 `.env` 文件，填入以下信息：

```env
# Google Gemini API Key (必须)
# 获取地址: https://aistudio.google.com/app/apikey
API_KEY=your_gemini_api_key_here

# Supabase 配置 (必须，用于登录和同步)
# 获取地址: Supabase Dashboard -> Project Settings -> API
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# 其他模型 Key (可选)
DEEPSEEK_API_KEY=
SPARK_API_KEY=
```

---

## 6. 启动开发服务器

执行以下命令启动本地开发服务：

```bash
npm run dev
```

启动成功后，控制台会显示访问地址，通常为 `http://localhost:5173`。

---

## 7. 常见问题排查

### Q1: `npm install` 报错 `@google/genai` 找不到版本？
*   **解决**: 尝试运行 `npm install @google/genai@latest` 手动更新，或使用 `npm install --legacy-peer-deps`。

### Q2: 登录时提示 "Database error" 或 "Relation not found"？
*   **解决**: 说明 Supabase 数据库表未创建。请重新执行 **步骤 4.2** 中的 SQL 脚本。

### Q3: 头像上传失败，提示 "Bucket not found"？
*   **解决**: 请前往 Supabase Storage 页面，手动创建一个名为 `avatars` 的公开存储桶 (Public Bucket)。

### Q4: AI 校对一直 loading 不出结果？
*   **解决**: 
    1. 检查控制台 Console 是否有 401/403 错误。
    2. 确认 `.env` 中的 `API_KEY` 是否有效。
    3. 检查网络是否能连接 Google API (部分地区需代理)。

---

## 8. 构建生产版本

如需部署到生产环境 (如 Vercel/Netlify)：

```bash
npm run build
```

构建产物将位于 `dist/` 目录下。请确保在托管平台的后台也配置了相同的环境变量。
