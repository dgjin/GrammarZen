import React from 'react';
import { Issue, IssueType } from '../types';
import { AlertCircle, Type, Sparkles, ShieldAlert, Check, X, ShieldPlus, MessageSquareQuote } from 'lucide-react';

interface IssueCardProps {
  issue: Issue;
  isSelected?: boolean;
  onClick?: () => void;
  onAccept: (e: React.MouseEvent) => void;
  onIgnore: (e: React.MouseEvent) => void;
  onWhitelist: (e: React.MouseEvent) => void;
}

const getIssueConfig = (type: IssueType) => {
  switch (type) {
    case IssueType.SENSITIVE:
      return {
        icon: ShieldAlert,
        label: '合规/敏感',
        borderColor: 'border-rose-200',
        bgHover: 'hover:bg-rose-50/50',
        badgeBg: 'bg-rose-100',
        badgeText: 'text-rose-700',
        badgeBorder: 'border-rose-200'
      };
    case IssueType.TYPO:
      return {
        icon: Type,
        label: '错别字',
        borderColor: 'border-red-200',
        bgHover: 'hover:bg-red-50/50',
        badgeBg: 'bg-red-100',
        badgeText: 'text-red-700',
        badgeBorder: 'border-red-200'
      };
    case IssueType.GRAMMAR:
      return {
        icon: AlertCircle,
        label: '语病',
        borderColor: 'border-orange-200',
        bgHover: 'hover:bg-orange-50/50',
        badgeBg: 'bg-orange-100',
        badgeText: 'text-orange-700',
        badgeBorder: 'border-orange-200'
      };
    case IssueType.PUNCTUATION:
      return {
        icon: MessageSquareQuote,
        label: '标点',
        borderColor: 'border-blue-200',
        bgHover: 'hover:bg-blue-50/50',
        badgeBg: 'bg-blue-100',
        badgeText: 'text-blue-700',
        badgeBorder: 'border-blue-200'
      };
    case IssueType.STYLE:
    case IssueType.SUGGESTION:
    default:
      return {
        icon: Sparkles,
        label: '风格建议',
        borderColor: 'border-purple-200',
        bgHover: 'hover:bg-purple-50/50',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-700',
        badgeBorder: 'border-purple-200'
      };
  }
};

export const IssueCard: React.FC<IssueCardProps> = ({ issue, isSelected, onClick, onAccept, onIgnore, onWhitelist }) => {
  const config = getIssueConfig(issue.type);
  const Icon = config.icon;

  return (
    <div 
      onClick={onClick}
      className={`
        p-4 rounded-xl border transition-all duration-200 group cursor-pointer relative bg-white
        ${isSelected 
          ? 'border-brand-500 ring-1 ring-brand-200 shadow-md bg-brand-50/5' 
          : `${config.borderColor} ${config.bgHover} hover:shadow-md hover:-translate-y-0.5`
        }
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>
          <Icon className="w-3.5 h-3.5" />
          <span>{config.label}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-3 mb-3 text-sm">
        <div className="flex-1 bg-red-50/80 text-red-700 px-3 py-2 rounded-md line-through decoration-red-400/50 decoration-2 break-words border border-red-100/50">
          {issue.original}
        </div>
        <span className="text-slate-300">→</span>
        <div className="flex-1 bg-green-50/80 text-green-700 px-3 py-2 rounded-md font-medium break-words border border-green-100/50">
          {issue.suggestion}
        </div>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed pl-1 border-l-2 border-slate-100 py-0.5">
        {issue.reason}
      </p>

      {/* Action Toolbar */}
      <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-50 opacity-80 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 hover:text-green-800 transition-colors border border-transparent hover:border-green-200"
          title="采纳此修改"
        >
          <Check className="w-3.5 h-3.5" />
          采纳
        </button>
        <button 
          onClick={onIgnore}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-slate-800 transition-colors border border-transparent hover:border-slate-200"
          title="忽略此问题"
        >
          <X className="w-3.5 h-3.5" />
          忽略
        </button>
        <button 
          onClick={onWhitelist}
          className="flex items-center justify-center px-2 py-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors border border-transparent hover:border-brand-100"
          title="忽略并加入白名单"
        >
          <ShieldPlus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};