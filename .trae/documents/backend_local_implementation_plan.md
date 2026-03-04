# GrammarZen - 后端服务Spring Boot实现计划

## 项目现状分析

当前项目中的后端服务包括：

1. **collaborationService.ts** - 协作会话服务，使用内存存储
2. **recommendationService.ts** - 推荐服务，使用内存存储
3. **supabaseService.ts** - Supabase数据存储服务，已经使用Supabase
4. **geminiService.ts** - AI模型服务，与外部API交互

## 实现目标

使用Spring Boot实现后端服务，数据存储仍使用Supabase。具体来说：

1. 创建Spring Boot后端项目
2. 实现协作会话服务
3. 实现推荐服务
4. 实现用户认证和授权
5. 保持与前端的兼容性

## 实施计划

### [ ] 任务1: 创建Spring Boot项目
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - 创建Spring Boot项目结构
  - 配置依赖和环境
  - 设置项目基础架构
- **成功标准**:
  - Spring Boot项目创建完成
  - 项目能够正常启动
- **测试要求**:
  - `programmatic` TR-1.1: 项目能够正常构建和运行
  - `human-judgement` TR-1.2: 项目结构清晰，符合Spring Boot最佳实践

### [ ] 任务2: 配置Supabase集成
- **优先级**: P0
- **依赖**: 任务1
- **描述**:
  - 配置Supabase客户端
  - 设置数据库连接
  - 实现基础数据访问层
- **成功标准**:
  - Supabase集成配置完成
  - 能够正常访问数据库
- **测试要求**:
  - `programmatic` TR-2.1: 测试数据库连接
  - `programmatic` TR-2.2: 测试基础数据操作

### [ ] 任务3: 实现协作会话服务
- **优先级**: P0
- **依赖**: 任务2
- **描述**:
  - 实现会话的创建、获取、更新、删除功能
  - 实现参与者管理和消息功能
  - 提供RESTful API接口
- **成功标准**:
  - 协作会话服务能够正常工作
  - API接口符合前端需求
- **测试要求**:
  - `programmatic` TR-3.1: 测试创建和获取协作会话
  - `programmatic` TR-3.2: 测试更新协作文档内容
  - `programmatic` TR-3.3: 测试添加和移除参与者
  - `programmatic` TR-3.4: 测试发送和获取消息

### [ ] 任务4: 实现推荐服务
- **优先级**: P1
- **依赖**: 任务2
- **描述**:
  - 实现推荐逻辑
  - 实现推荐数据的存储和检索
  - 提供RESTful API接口
- **成功标准**:
  - 推荐服务能够正常工作
  - API接口符合前端需求
- **测试要求**:
  - `programmatic` TR-4.1: 测试获取推荐
  - `programmatic` TR-4.2: 测试历史分析统计

### [ ] 任务5: 实现用户认证和授权
- **优先级**: P1
- **依赖**: 任务2
- **描述**:
  - 实现用户注册和登录功能
  - 实现JWT认证
  - 实现授权控制
- **成功标准**:
  - 用户认证和授权功能正常工作
  - 能够保护API接口
- **测试要求**:
  - `programmatic` TR-5.1: 测试用户注册和登录
  - `programmatic` TR-5.2: 测试JWT认证
  - `programmatic` TR-5.3: 测试授权控制

### [ ] 任务6: 集成和测试
- **优先级**: P1
- **依赖**: 任务3, 任务4, 任务5
- **描述**:
  - 集成所有服务
  - 测试整体功能
  - 修复可能的问题
- **成功标准**:
  - 所有服务能够正常工作
  - 数据能够正确存储和检索
  - 应用能够正常运行
- **测试要求**:
  - `programmatic` TR-6.1: 测试应用的整体功能
  - `human-judgement` TR-6.2: 确认应用运行流畅，无明显卡顿

### [ ] 任务7: 文档和优化
- **优先级**: P2
- **依赖**: 任务6
- **描述**:
  - 更新相关文档
  - 优化服务性能
  - 确保代码质量
- **成功标准**:
  - 文档更新完成
  - 服务性能优化完成
  - 代码质量符合要求
- **测试要求**:
  - `human-judgement` TR-7.1: 确认文档完整清晰
  - `programmatic` TR-7.2: 测试服务性能

### [ ] 任务8: 代码提交到GitHub
- **优先级**: P1
- **依赖**: 任务7
- **描述**:
  - 创建GitHub仓库
  - 配置Git
  - 提交代码到GitHub
- **成功标准**:
  - 代码成功提交到GitHub
  - 仓库结构完整
- **测试要求**:
  - `programmatic` TR-8.1: 代码成功提交到GitHub
  - `human-judgement` TR-8.2: 仓库结构清晰，包含所有必要文件

## 技术实现细节

### 技术栈

- **后端框架**: Spring Boot 3.0+
- **编程语言**: Java 17+
- **数据库**: Supabase (PostgreSQL)
- **认证**: JWT
- **API设计**: RESTful
- **构建工具**: Maven

### 项目结构

```
grammarzen-backend/
├── src/
│   ├── main/
│   │   ├── java/com/grammarzen/
│   │   │   ├── controller/       # API控制器
│   │   │   ├── service/          # 业务逻辑
│   │   │   ├── repository/       # 数据访问
│   │   │   ├── model/            # 数据模型
│   │   │   ├── config/           # 配置
│   │   │   ├── security/         # 安全
│   │   │   └── util/             # 工具类
│   │   └── resources/
│   │       ├── application.yml    # 应用配置
│   │       └── static/            # 静态资源
│   └── test/                      # 测试代码
├── pom.xml                        # Maven配置
└── README.md                      # 项目说明
```

### 主要功能模块

1. **用户认证模块**:
   - 用户注册和登录
   - JWT token生成和验证
   - 授权控制

2. **协作会话模块**:
   - 会话管理
   - 参与者管理
   - 消息管理

3. **推荐模块**:
   - 推荐逻辑
   - 历史分析
   - 推荐数据存储

4. **AI服务模块**:
   - Gemini API集成
   - 文本处理
   - 校对服务

### API设计

1. **用户API**:
   - POST /api/auth/register - 用户注册
   - POST /api/auth/login - 用户登录
   - GET /api/auth/me - 获取当前用户信息

2. **协作会话API**:
   - POST /api/collaboration/sessions - 创建会话
   - GET /api/collaboration/sessions - 获取会话列表
   - GET /api/collaboration/sessions/{id} - 获取会话详情
   - PUT /api/collaboration/sessions/{id} - 更新会话
   - DELETE /api/collaboration/sessions/{id} - 删除会话
   - POST /api/collaboration/sessions/{id}/participants - 添加参与者
   - DELETE /api/collaboration/sessions/{id}/participants/{userId} - 移除参与者
   - POST /api/collaboration/sessions/{id}/messages - 发送消息
   - GET /api/collaboration/sessions/{id}/messages - 获取消息列表

3. **推荐API**:
   - GET /api/recommendations - 获取推荐
   - GET /api/recommendations/stats - 获取历史分析统计

4. **AI服务API**:
   - POST /api/ai/check - 文本校对
   - POST /api/ai/summary - 文本摘要

## 风险和注意事项

1. **跨域问题**: 确保配置CORS，允许前端访问
2. **API兼容性**: 确保API接口与前端需求一致
3. **性能优化**: 确保服务性能满足需求
4. **错误处理**: 完善错误处理机制，提高系统可靠性
5. **安全问题**: 确保用户数据安全，防止SQL注入等攻击

## 预期成果

1. Spring Boot后端服务实现完成
2. 所有功能模块正常工作
3. API接口符合前端需求
4. 应用整体运行流畅
5. 代码质量符合要求