import React from 'react';
import { X, Zap, Sparkles, ShieldAlert, FileBadge, PenTool, LayoutTemplate, FileSearch, HelpCircle, Book, ShieldCheck, Cpu, Maximize2, ArrowRightLeft, User, Cloud, Settings } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const modes = [
    { icon: Zap, label: '快速模式', desc: '速度最快，专注于明显的错别字、标点错误和基础语病。' },
    { icon: Sparkles, label: '专业深度', desc: '深度分析语法逻辑、形似音似字错误，提供专业的润色建议。' },
    { icon: ShieldAlert, label: '合规专项', desc: '忽略语法错误，仅专注于敏感词、广告法违禁词及隐私信息检测。' },
    { icon: FileBadge, label: '公文规范', desc: '检查政治用语规范、公文格式标准及严肃用语风格。' },
    { icon: PenTool, label: '智能润色', desc: '优化句式结构，提升文采，使表达更优雅流畅。' },
    { icon: LayoutTemplate, label: '格式分析', desc: '专注于字体、字号、页边距等排版规范性检查（建议配合PDF/图片）。' },
    { icon: FileSearch, label: '原文件', desc: '直接分析文件内容（PDF/图片），保留视觉上下文，进行整体质量评估。' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full m-4 overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-brand-600" />
            使用帮助与指南
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
          
          {/* 1. Models & Engines (New) */}
          <section>
             <h4 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Cpu className="w-4 h-4 text-indigo-500" />
              多模型引擎支持
            </h4>
            <div className="bg-indigo-50/50 rounded-lg p-4 text-sm text-slate-600 border border-indigo-100 space-y-2">
               <p><strong className="text-indigo-700">Google Gemini (默认)</strong>：速度快，免费额度高，适合大多数场景。含 Flash (极速) 和 Pro (推理增强) 版本。</p>
               <p><strong className="text-indigo-700">DeepSeek (深度求索)</strong>：国产顶尖模型，逻辑推理能力强。支持 V3 (对话) 和 R1 (推理) 版本。（需配置 Key）</p>
               <p><strong className="text-indigo-700">科大讯飞星火</strong>：中文理解能力优异，支持 Ultra 4.0 等版本。（需配置 Key）</p>
            </div>
          </section>

          {/* 2. Check Modes */}
          <section>
            <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Sparkles className="w-4 h-4 text-brand-500" />
              智能校对模式
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {modes.map((mode, idx) => (
                <div key={idx} className="flex gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50/30 hover:bg-white hover:shadow-sm hover:border-brand-100 transition-all">
                  <div className="shrink-0 mt-0.5">
                    <mode.icon className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-slate-700">{mode.label}</h5>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">{mode.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Interaction Features (New) */}
           <section>
            <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Maximize2 className="w-4 h-4 text-green-600" />
              视图与交互
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
               <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-2 text-slate-700 font-medium text-sm">
                      <Maximize2 className="w-4 h-4 text-blue-500" /> 全屏沉浸
                  </div>
                  <p className="text-xs text-slate-500">点击结果区顶部的全屏按钮，进入无干扰阅读模式，专注于文稿修订。</p>
               </div>
               <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-2 text-slate-700 font-medium text-sm">
                      <ArrowRightLeft className="w-4 h-4 text-purple-500" /> 双向联动
                  </div>
                  <p className="text-xs text-slate-500">点击右侧问题卡片，左侧自动定位到文本；点击左侧高亮文本，右侧自动定位到问题卡片。</p>
               </div>
               <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-2 text-slate-700 font-medium text-sm">
                      <FileSearch className="w-4 h-4 text-orange-500" /> 原文件预览
                  </div>
                  <p className="text-xs text-slate-500">上传 PDF/图片后，可在结果区切换“文本”与“原文件”视图，对照查看原始排版。</p>
               </div>
            </div>
          </section>

          {/* 4. User Account & Data (New) */}
          <section>
            <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
               <User className="w-4 h-4 text-brand-600" />
               账号与数据
            </h4>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-4">
                <div className="flex gap-3">
                    <div className="bg-white p-2 rounded-full shadow-sm border border-slate-100 h-fit">
                        <Cloud className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                        <h5 className="text-sm font-semibold text-slate-700">云端同步</h5>
                        <p className="text-xs text-slate-600 mt-1">
                            登录账号后，您配置的<b>白名单</b>、<b>敏感词库</b>和<b>规则库</b>将自动同步到云端数据库。您可以在任何设备上登录并访问一致的配置。未登录时数据仅保存在本地浏览器。
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <div className="bg-white p-2 rounded-full shadow-sm border border-slate-100 h-fit">
                        <Settings className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                        <h5 className="text-sm font-semibold text-slate-700">个人中心</h5>
                        <p className="text-xs text-slate-600 mt-1">
                            点击顶部导航栏的头像即可进入个人中心。支持<b>修改昵称</b>、<b>更改登录密码</b>。您还可以点击头像区域<b>上传自定义图片</b>作为头像。
                        </p>
                    </div>
                </div>
            </div>
          </section>

          {/* 5. Core Features (Rules, Sensitive, Whitelist) */}
          <section>
            <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <ShieldCheck className="w-4 h-4 text-rose-500" />
              规则与合规
            </h4>
            <div className="space-y-3">
              <div className="flex gap-4 items-start">
                 <div className="bg-purple-100 p-1.5 rounded-lg mt-0.5">
                    <Book className="w-4 h-4 text-purple-600" />
                 </div>
                 <div>
                    <h5 className="text-sm font-semibold text-slate-700">本地规则库 (Rule Library)</h5>
                    <p className="text-xs text-slate-600 mt-1">
                      粘贴企业写作规范（如《品牌手册》），AI 自动提取规则。校对时勾选对应规则库，系统将强制执行（例如“统一将 APP 写作 App”）。
                    </p>
                 </div>
              </div>
              <div className="flex gap-4 items-start">
                 <div className="bg-rose-100 p-1.5 rounded-lg mt-0.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                 </div>
                 <div>
                    <h5 className="text-sm font-semibold text-slate-700">敏感词与合规管理</h5>
                    <p className="text-xs text-slate-600 mt-1">
                      内置广告法违禁词库，支持导入自定义词表。在“合规专项”模式下，系统会忽略语法错误，重点检测违规内容。
                    </p>
                 </div>
              </div>
               <div className="flex gap-4 items-start">
                 <div className="bg-green-100 p-1.5 rounded-lg mt-0.5">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                 </div>
                 <div>
                    <h5 className="text-sm font-semibold text-slate-700">白名单 (Whitelist)</h5>
                    <p className="text-xs text-slate-600 mt-1">
                      对于专有名词，加入白名单后，AI 在后续校对中将绝对忽略这些词汇。在结果卡片点击“盾牌”图标即可一键添加。
                    </p>
                 </div>
              </div>
            </div>
          </section>

          {/* 6. FAQ */}
           <section>
            <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <HelpCircle className="w-4 h-4 text-blue-500" />
              常见问题
            </h4>
            <div className="space-y-3">
              <details className="group bg-slate-50 rounded-lg border border-slate-200 open:bg-white open:shadow-sm transition-all">
                <summary className="flex items-center justify-between p-3 cursor-pointer list-none font-medium text-slate-700 text-sm">
                  支持哪些文件格式？
                  <span className="transition group-open:rotate-180">
                    <svg fill="none" height="16" width="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"></path></svg>
                  </span>
                </summary>
                <div className="text-slate-600 text-xs px-3 pb-3 pt-0 leading-relaxed">
                  支持 PDF, Word (.docx), 图片 (.jpg, .png, .webp), 纯文本 (.txt) 和富文本 (.rtf)。单文件大小限制为 10MB。
                </div>
              </details>
              
               <details className="group bg-slate-50 rounded-lg border border-slate-200 open:bg-white open:shadow-sm transition-all">
                <summary className="flex items-center justify-between p-3 cursor-pointer list-none font-medium text-slate-700 text-sm">
                  如何配置 DeepSeek 或星火模型？
                  <span className="transition group-open:rotate-180">
                    <svg fill="none" height="16" width="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"></path></svg>
                  </span>
                </summary>
                <div className="text-slate-600 text-xs px-3 pb-3 pt-0 leading-relaxed">
                  需要在项目根目录的 <code>.env</code> 文件中配置 <code>DEEPSEEK_API_KEY</code> 或 <code>SPARK_API_KEY</code>。配置完成后需重启服务。
                </div>
              </details>

               <details className="group bg-slate-50 rounded-lg border border-slate-200 open:bg-white open:shadow-sm transition-all">
                <summary className="flex items-center justify-between p-3 cursor-pointer list-none font-medium text-slate-700 text-sm">
                  如何导出校对报告？
                  <span className="transition group-open:rotate-180">
                     <svg fill="none" height="16" width="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"></path></svg>
                  </span>
                </summary>
                <div className="text-slate-600 text-xs px-3 pb-3 pt-0 leading-relaxed">
                  校对完成后，点击结果区右上角的“导出”按钮，可选择导出纯文本 (.txt)、Word 文档 (.doc) 或完整 Markdown 报告 (.md)，甚至直接复制报告内容。
                </div>
              </details>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-center shrink-0">
            <button onClick={onClose} className="px-8 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-700 rounded-lg text-sm font-medium transition-colors shadow-sm">
                关闭帮助
            </button>
        </div>
      </div>
    </div>
  );
};