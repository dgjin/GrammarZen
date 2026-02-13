import React from 'react';
import { Issue, IssueType } from '../types';
import { AlertCircle, FileText, Type, Sparkles, ShieldAlert, Check, X, ShieldPlus } from 'lucide-react';

interface IssueCardProps {
  issue: Issue;
  isSelected?: boolean;
  onClick?: () => void;
  onAccept: (e: React.MouseEvent) => void;
  onIgnore: (e: React.MouseEvent) => void;
  onWhitelist: (e: React.MouseEvent) => void;
}

const getIcon = (type: IssueType) => {
  switch (type) {
    case IssueType.SENSITIVE:
      return <ShieldAlert className="w-4 h-4 text-rose-600" />;
    case IssueType.TYPO:
      return <Type className="w-4 h-4 text-red-500" />;
    case IssueType.GRAMMAR:
      return <AlertCircle className="w-4 h-4 text-orange-500" />;
    case IssueType.PUNCTUATION:
      return <FileText className="w-4 h-4 text-blue-500" />;
    case IssueType.STYLE:
    case IssueType.SUGGESTION:
    default:
      return <Sparkles className="w-4 h-4 text-purple-500" />;
  }
};

const getLabel = (type: IssueType) => {
  switch (type) {
    case IssueType.SENSITIVE: return "合规/敏感";
    case IssueType.TYPO: return "错别字";
    case IssueType.GRAMMAR: return "语病";
    case IssueType.PUNCTUATION: return "标点";
    case IssueType.STYLE: return "风格";
    default: return "建议";
  }
};

const getColorClass = (type: IssueType) => {
  switch (type) {
    case IssueType.SENSITIVE: return "bg-rose-100 border-rose-200 text-rose-800 ring-1 ring-rose-200";
    case IssueType.TYPO: return "bg-red-50 border-red-100 text-red-800";
    case IssueType.GRAMMAR: return "bg-orange-50 border-orange-100 text-orange-800";
    case IssueType.PUNCTUATION: return "bg-blue-50 border-blue-100 text-blue-800";
    case IssueType.STYLE:
    default: return "bg-purple-50 border-purple-100 text-purple-800";
  }
};

export const IssueCard: React.FC<IssueCardProps> = ({ issue, isSelected, onClick, onAccept, onIgnore, onWhitelist }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        bg-white p-4 rounded-lg border shadow-sm transition-all duration-200 group cursor-pointer relative
        ${isSelected 
          ? 'border-brand-500 ring-2 ring-brand-200 shadow-md' 
          : issue.type === IssueType.SENSITIVE 
            ? 'border-rose-200 shadow-rose-100 hover:shadow-md' 
            : 'border-slate-200 hover:shadow-md'
        }
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${getColorClass(issue.type)}`}>
          {getIcon(issue.type)}
          <span>{getLabel(issue.type)}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-3 mb-2 text-sm">
        <div className="flex-1 bg-red-50 text-red-700 px-2 py-1.5 rounded line-through decoration-red-400 decoration-2 opacity-80 break-words">
          {issue.original}
        </div>
        <span className="text-slate-400">→</span>
        <div className="flex-1 bg-green-50 text-green-700 px-2 py-1.5 rounded font-medium break-words">
          {issue.suggestion}
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-2 mb-3">
        {issue.reason}
      </p>

      {/* Action Toolbar */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 opacity-80 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
          title="采纳此修改"
        >
          <Check className="w-3.5 h-3.5" />
          采纳
        </button>
        <button 
          onClick={onIgnore}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
          title="忽略此问题"
        >
          <X className="w-3.5 h-3.5" />
          忽略
        </button>
        <button 
          onClick={onWhitelist}
          className="flex items-center justify-center px-2 py-1.5 rounded text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
          title="忽略并加入白名单"
        >
          <ShieldPlus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};