import React, { useState } from 'react';
import { RuleLibrary } from '../types';
import { extractRulesFromText } from '../services/geminiService';
import { X, Book, Trash2, Loader2, Sparkles, BookOpen } from 'lucide-react';

interface RuleManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraries: RuleLibrary[];
  onAddLibrary: (library: RuleLibrary) => void;
  onDeleteLibrary: (id: string) => void;
}

export const RuleManagerModal: React.FC<RuleManagerModalProps> = ({
  isOpen,
  onClose,
  libraries,
  onAddLibrary,
  onDeleteLibrary
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [inputText, setInputText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setAnalyzing(true);
    setError(null);

    try {
      const result = await extractRulesFromText(inputText);
      const newLib: RuleLibrary = {
        id: crypto.randomUUID(),
        name: result.name,
        description: result.description,
        rules: result.rules,
        createdAt: Date.now()
      };
      onAddLibrary(newLib);
      setActiveTab('list');
      setInputText('');
    } catch (err) {
      setError("规则提取失败，请检查网络或重试。");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full m-4 overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            <Book className="w-5 h-5 text-brand-600" />
            本地规则库管理
          </h3>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
            <button
                onClick={() => setActiveTab('list')}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'list' ? 'border-brand-500 text-brand-600 bg-brand-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
            >
                已存规则库 ({libraries.length})
            </button>
            <button
                onClick={() => setActiveTab('create')}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'create' ? 'border-brand-500 text-brand-600 bg-brand-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
            >
                新建规则库
            </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
            {activeTab === 'list' ? (
                <div className="space-y-4">
                    {libraries.length === 0 ? (
                        <div className="text-center py-10">
                            <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-slate-500 mb-2">暂无自定义规则库</p>
                            <button onClick={() => setActiveTab('create')} className="text-brand-600 hover:underline text-sm">点击新建，上传您的文档规范</button>
                        </div>
                    ) : (
                        libraries.map(lib => (
                            <div key={lib.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-semibold text-slate-800">{lib.name}</h4>
                                        <p className="text-xs text-slate-400">{new Date(lib.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <button onClick={() => onDeleteLibrary(lib.id)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-sm text-slate-600 mb-3">{lib.description}</p>
                                <div className="bg-slate-50 rounded p-2 border border-slate-100 max-h-32 overflow-y-auto custom-scrollbar">
                                    <ul className="list-disc list-inside text-xs text-slate-500 space-y-1">
                                        {lib.rules.map((rule, i) => (
                                            <li key={i}>{rule}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="h-full flex flex-col">
                    <p className="text-sm text-slate-600 mb-3">
                        粘贴您的企业写作规范、文档格式要求或任何文本。AI 将自动分析并提取出可执行的校验规则。
                    </p>
                    <div className="flex-1 relative">
                        <textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="例如：\n1. 所有的 'APP' 必须写作 'App'。\n2. 禁止使用‘小编’自称。\n3. 公司全称必须是‘未来科技有限公司’..."
                            className="w-full h-full p-4 rounded-lg border border-slate-200 resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                            disabled={analyzing}
                        />
                         {analyzing && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center flex-col gap-3 rounded-lg border border-slate-200">
                                <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                                <span className="text-sm text-brand-700 font-medium animate-pulse">正在智能分析文档规则...</span>
                            </div>
                        )}
                    </div>
                    {error && <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><X className="w-3 h-3"/> {error}</p>}
                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={handleAnalyze}
                            disabled={!inputText.trim() || analyzing}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                        >
                            <Sparkles className="w-4 h-4" />
                            {analyzing ? '分析中...' : '生成规则库'}
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};