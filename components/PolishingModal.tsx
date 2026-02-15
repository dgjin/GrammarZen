import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check, RefreshCw, Copy, ArrowRight, ArrowLeft } from 'lucide-react';
import { checkChineseText } from '../services/geminiService';
import { ProofreadResult } from '../types';

interface PolishingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  onReplace: (newText: string) => void;
  modelName: string;
}

export const PolishingModal: React.FC<PolishingModalProps> = ({
  isOpen,
  onClose,
  selectedText,
  onReplace,
  modelName
}) => {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && selectedText) {
      handlePolish();
    } else {
        setResult(''); // Reset on close/open
    }
  }, [isOpen, selectedText]);

  const handlePolish = async () => {
    setLoading(true);
    setError(null);
    setResult(''); // Clear previous
    
    try {
      // Use the 'polishing' mode of the service
      await checkChineseText(
        selectedText,
        'polishing',
        modelName,
        [], [], [], // No specific rules/whitelist for quick polish
        "请只针对这段文字进行润色，保持原意，使其更通顺优美。",
        'general',
        (partial) => {
            if (partial.correctedText) {
                setResult(partial.correctedText);
            }
        }
      );
    } catch (err: any) {
      setError("润色失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
       {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      {/* Modal Content */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[80vh] animate-fade-in-up">
        
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600" />
            局部润色
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto bg-slate-50/30 flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Original */}
            <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">原文</span>
                <div className="p-4 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm leading-relaxed h-full overflow-y-auto max-h-[300px]">
                    {selectedText}
                </div>
            </div>

            {/* Arrow for Desktop */}
            <div className="hidden md:flex items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="bg-white border border-slate-200 p-1.5 rounded-full shadow-sm text-slate-400">
                    <ArrowRight className="w-4 h-4" />
                </div>
            </div>

             {/* Arrow for Mobile */}
             <div className="md:hidden flex justify-center">
                 <ArrowRight className="w-5 h-5 text-slate-300 rotate-90" />
            </div>

            {/* Result */}
            <div className="flex flex-col gap-2 relative">
                 <span className="text-xs font-bold text-teal-600 uppercase tracking-wider flex items-center gap-2">
                    润色结果
                    {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
                 </span>
                 <div className={`p-4 bg-teal-50/50 border border-teal-100 rounded-lg text-slate-800 text-sm leading-relaxed h-full overflow-y-auto max-h-[300px] relative transition-all ${loading ? 'opacity-70' : ''}`}>
                    {error ? (
                        <p className="text-red-500 text-xs">{error}</p>
                    ) : (
                        result || <span className="text-slate-400 italic">正在生成...</span>
                    )}
                 </div>
            </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white flex justify-between items-center">
           <button 
             onClick={handlePolish}
             disabled={loading}
             className="text-slate-500 hover:text-teal-600 text-sm font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
           >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              重新生成
           </button>

           <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button 
                onClick={() => { onReplace(result); onClose(); }}
                disabled={loading || !result || !!error}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                替换原文
              </button>
           </div>
        </div>

      </div>
    </div>
  );
};