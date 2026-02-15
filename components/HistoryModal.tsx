import React, { useState, useEffect } from 'react';
import { HistoryRecord } from '../types';
import { loadHistory, deleteHistoryRecord } from '../services/supabaseService';
import { X, History, Trash2, Eye, Calendar, FileText, Loader2, Search, FileType } from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onLoadRecord: (record: HistoryRecord) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  userId,
  onLoadRecord
}) => {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchHistory();
    }
  }, [isOpen, userId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const data = await loadHistory(userId);
      setRecords(data);
    } catch (e) {
      console.error("Fetch history failed", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("确定要删除这条历史记录吗？")) {
      setDeletingId(id);
      await deleteHistoryRecord(id);
      setRecords(prev => prev.filter(r => r.id !== id));
      setDeletingId(null);
    }
  };

  const handleSelect = (record: HistoryRecord) => {
      onLoadRecord(record);
      onClose();
  };

  if (!isOpen) return null;

  const getScoreColorClass = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 75) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 60) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-brand-600" />
            校对历史记录
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p>加载中...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <History className="w-16 h-16 mb-4 text-slate-200" />
              <p className="text-lg font-medium text-slate-500">暂无历史记录</p>
              <p className="text-sm mt-1">开始校对后，您的记录将自动保存在这里。</p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <div 
                  key={record.id} 
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group cursor-pointer relative"
                  onClick={() => handleSelect(record)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getScoreColorClass(record.score)}`}>
                            {record.score} 分
                        </span>
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {record.checkMode === 'fast' ? '快速模式' : 
                             record.checkMode === 'professional' ? '专业模式' : 
                             record.checkMode === 'sensitive' ? '合规模式' : 
                             record.checkMode === 'official' ? '公文模式' :
                             record.checkMode === 'polishing' ? '润色模式' :
                             record.checkMode === 'format' ? '格式分析' : record.checkMode}
                        </span>
                        {record.fileName && (
                            <span className="flex items-center gap-1 text-xs text-slate-500 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 max-w-[150px] truncate">
                                <FileType className="w-3 h-3" />
                                {record.fileName}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(record.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 line-clamp-2 mb-2 font-medium">
                      {record.summary || "无摘要"}
                  </p>
                  
                  {record.originalText ? (
                      <p className="text-xs text-slate-400 line-clamp-1 bg-slate-50 p-1.5 rounded font-mono">
                          原文: {record.originalText.substring(0, 60)}...
                      </p>
                  ) : (
                      <p className="text-xs text-slate-400 italic">纯文件模式，无文本预览</p>
                  )}

                  {/* Hover Actions */}
                  <div className="absolute right-4 bottom-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => handleDelete(record.id, e)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        title="删除记录"
                        disabled={deletingId === record.id}
                      >
                          {deletingId === record.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />}
                      </button>
                      <button 
                        className="p-2 text-brand-500 hover:text-brand-700 hover:bg-brand-50 rounded-full transition-colors bg-white shadow-sm border border-slate-100"
                        title="查看/加载"
                      >
                          <Eye className="w-4 h-4" />
                      </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};