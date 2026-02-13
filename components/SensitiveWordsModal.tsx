import React, { useState, useRef } from 'react';
import { X, ShieldAlert, Library, Download, Upload, Plus, Ban, Trash2 } from 'lucide-react';

const BUILT_IN_VOCABULARIES = [
  { name: '广告法违规词库', path: '/Vocabulary/ad-laws.txt', description: '包含“第一”、“顶级”等极限词' },
  { name: '通用违禁词库', path: '/Vocabulary/general-sensitive.txt', description: '包含涉政、暴力等常规敏感词' }
];

interface SensitiveWordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  words: string[];
  onAdd: (word: string) => void;
  onRemove: (word: string) => void;
  onClear: () => void;
  onBatchAdd: (words: string[]) => void;
}

export const SensitiveWordsModal: React.FC<SensitiveWordsModalProps> = ({
  isOpen,
  onClose,
  words,
  onAdd,
  onRemove,
  onClear,
  onBatchAdd
}) => {
  const [newWord, setNewWord] = useState('');
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (newWord.trim()) {
      onAdd(newWord.trim());
      setNewWord('');
    }
  };

  const parseAndAdd = (text: string) => {
    let newWords: string[] = [];
    try {
      // Try parsing as JSON first
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        newWords = json.filter((item: any) => typeof item === 'string').map((s: string) => s.trim());
      } else {
           throw new Error("Not an array");
      }
    } catch (e) {
      // Fallback to TXT/CSV parsing
      newWords = text.split(/[\n,\r;|]+/)
        .map(w => w.trim())
        .filter(w => w.length > 0);
    }

    if (newWords.length === 0) {
      alert("未在文件中找到有效的词汇。");
      return;
    }
    onBatchAdd(newWords);
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) parseAndAdd(text);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLoadSystem = async (path: string) => {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error("Load failed");
      const text = await response.text();
      parseAndAdd(text);
    } catch (e) {
      console.error(e);
      alert("无法加载系统内置词库，请检查网络或 Vocabulary 目录配置。");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full m-4 overflow-hidden animate-fade-in-up border border-slate-200 flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            本地敏感词库
          </h3>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {/* Built-in Vocab Section */}
          <div className="mb-6 p-4 bg-brand-50/50 rounded-lg border border-brand-100">
              <h4 className="text-sm font-semibold text-brand-800 mb-2 flex items-center gap-1">
                  <Library className="w-4 h-4" />
                  系统内置词库
              </h4>
              <p className="text-xs text-brand-600/80 mb-3">加载系统预设的 Vocabulary 文件夹词库。</p>
              <div className="space-y-2">
                  {BUILT_IN_VOCABULARIES.map((vocab, index) => (
                      <div key={index} className="flex items-center justify-between bg-white p-2.5 rounded border border-brand-100">
                          <div>
                              <span className="text-sm font-medium text-slate-700">{vocab.name}</span>
                              <p className="text-xs text-slate-400 mt-0.5">{vocab.description}</p>
                          </div>
                          <button
                            onClick={() => handleLoadSystem(vocab.path)}
                            className="text-xs flex items-center gap-1 bg-brand-50 hover:bg-brand-100 text-brand-700 px-2 py-1.5 rounded transition-colors"
                          >
                              <Download className="w-3.5 h-3.5" />
                              加载
                          </button>
                      </div>
                  ))}
              </div>
          </div>

          <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-slate-600 font-medium">当前敏感词列表：</p>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-slate-500 hover:text-brand-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                >
                    <Upload className="w-3 h-3" /> 
                    自定义文件导入
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden"
                    accept=".txt,.csv,.json"
                    onChange={handleFileImport}
                />
              </div>
              <div className="flex gap-2">
                  <input 
                      type="text" 
                      value={newWord}
                      onChange={(e) => setNewWord(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                      placeholder="输入敏感词..."
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  />
                  <button 
                      onClick={handleAdd}
                      disabled={!newWord.trim()}
                      className="px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                      <Plus className="w-5 h-5" />
                  </button>
              </div>
          </div>

          {words.length === 0 ? (
            <div className="text-center text-slate-500 py-6 flex flex-col items-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
              <Ban className="w-10 h-10 mb-2 text-slate-300" />
              <p className="text-sm">暂无本地敏感词</p>
              <p className="text-xs text-slate-400 mt-1">请上方加载内置词库，或手动添加</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-[30vh] overflow-y-auto content-start p-1">
                {words.map((word, index) => (
                    <div key={index} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-800 rounded-lg text-sm border border-rose-100 group hover:border-rose-300 transition-all duration-200">
                    <span className="font-medium">{word}</span>
                    <button 
                        onClick={() => onRemove(word)}
                        className="text-rose-300 group-hover:text-rose-600 transition-colors ml-1 p-0.5 rounded-full hover:bg-rose-100"
                        title="移除"
                    >
                        <X className="w-3 h-3" />
                    </button>
                    </div>
                ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
          <div>
              {words.length > 0 && (
                 <span className="text-xs text-slate-400">共 {words.length} 个词汇</span>
              )}
          </div>
          <div className="flex gap-3 items-center">
            {words.length > 0 && (
                isConfirmingClear ? (
                   <div className="flex items-center gap-2 animate-fade-in">
                      <span className="text-sm text-slate-600">确定清空?</span>
                      <button 
                          onClick={() => {
                              onClear();
                              setIsConfirmingClear(false);
                          }}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                          确定
                      </button>
                      <button 
                          onClick={() => setIsConfirmingClear(false)}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                          取消
                      </button>
                   </div>
                ) : (
                    <button 
                        onClick={() => setIsConfirmingClear(true)} 
                        className="flex items-center gap-1.5 px-4 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-red-100"
                    >
                        <Trash2 className="w-4 h-4" />
                        清空
                    </button>
                )
            )}
            {!isConfirmingClear && (
                <button 
                    onClick={onClose}
                    className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                    完成
                </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};