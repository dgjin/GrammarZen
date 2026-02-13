import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProofreadResult, IssueType, Issue } from '../types';
import { IssueCard } from './IssueCard';
import { Copy, Check, ThumbsUp, AlertTriangle, FileDiff, Eye, Download, ChevronDown, CheckCheck, ListX } from 'lucide-react';
import { diffChars, Change } from 'diff';

interface ResultViewProps {
  result: ProofreadResult;
  originalText: string;
  onAddToWhitelist: (word: string) => void;
}

// Extended Diff Part with highlight flag
interface RenderPart extends Change {
  highlighted?: boolean;
}

export const ResultView: React.FC<ResultViewProps> = ({ result, originalText, onAddToWhitelist }) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'clean' | 'diff'>('clean');
  const [activeFilter, setActiveFilter] = useState<'all' | IssueType>('all');
  
  // State for interactive proofreading
  const [resolvedIndices, setResolvedIndices] = useState<Set<number>>(new Set());
  // Tracks modifications (ignore/whitelist reverts changes)
  const [currentText, setCurrentText] = useState(result.correctedText);
  // Tracks modifications status per issue index: 'accepted' | 'ignored' | 'whitelisted'
  const [issueStatus, setIssueStatus] = useState<Record<number, 'accepted' | 'ignored' | 'whitelisted'>>({});
  
  // Highlight State
  const [selectedIssueIndex, setSelectedIssueIndex] = useState<number | null>(null);

  // Sync state if result changes
  useEffect(() => {
    setResolvedIndices(new Set());
    setIssueStatus({});
    setCurrentText(result.correctedText);
    setSelectedIssueIndex(null);
  }, [result]);
  
  // Export State
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAction = (index: number, action: 'accept' | 'ignore' | 'whitelist', issueOriginal: string, issueSuggestion: string) => {
      setResolvedIndices(prev => {
          const newSet = new Set(prev);
          newSet.add(index);
          return newSet;
      });

      setIssueStatus(prev => ({
        ...prev,
        [index]: action === 'accept' ? 'accepted' : (action === 'whitelist' ? 'whitelisted' : 'ignored')
      }));

      // If user ignores/whitelists, we revert the specific change in currentText
      // Note: Reverting text based on string replacement is risky if duplicates exist.
      // Ideally we would rebuild text from diffs, but for now strict replacement of the suggestion with original is a best-effort.
      if (action === 'ignore' || action === 'whitelist') {
          // Revert correction
          // Warning: This simple replace might be ambiguous for duplicates.
          setCurrentText(prev => prev.replace(issueSuggestion, issueOriginal));
          
          if (action === 'whitelist') {
              onAddToWhitelist(issueOriginal);
          }
      }
  };

  const handleBatchAction = (action: 'accept' | 'ignore') => {
    // Identify currently visible (filtered) and unresolved issues
    const targets = result.issues
      .map((issue, idx) => ({ ...issue, originalIndex: idx }))
      .filter(issue => !resolvedIndices.has(issue.originalIndex))
      .filter(issue => {
          if (activeFilter === 'all') return true;
          if (activeFilter === IssueType.STYLE) {
            return issue.type === IssueType.STYLE || issue.type === IssueType.SUGGESTION;
          }
          return issue.type === activeFilter;
      });

    if (targets.length === 0) return;

    const newResolvedIndices = new Set(resolvedIndices);
    const newIssueStatus = { ...issueStatus };
    let newText = currentText;

    targets.forEach(issue => {
        const idx = issue.originalIndex;
        newResolvedIndices.add(idx);
        newIssueStatus[idx] = action === 'accept' ? 'accepted' : 'ignored';

        if (action === 'ignore') {
             // Revert correction to original
             newText = newText.replace(issue.suggestion, issue.original);
        }
    });

    setResolvedIndices(newResolvedIndices);
    setIssueStatus(newIssueStatus);
    setCurrentText(newText);
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportText = () => {
    downloadFile(currentText, `corrected-${Date.now()}.txt`, 'text/plain;charset=utf-8');
  };

  const handleExportReport = () => {
    const typeLabels: Record<string, string> = {
      [IssueType.SENSITIVE]: "敏感/合规",
      [IssueType.TYPO]: "错别字",
      [IssueType.GRAMMAR]: "语病",
      [IssueType.PUNCTUATION]: "标点",
      [IssueType.STYLE]: "风格",
      [IssueType.SUGGESTION]: "建议"
    };

    let report = `# GrammarZen 校对报告\n\n`;
    report += `**生成时间**: ${new Date().toLocaleString()}\n`;
    report += `**评分**: ${result.score}/100\n`;
    report += `**总结**: ${result.summary}\n\n`;
    report += `## 校对后文本\n\n${currentText}\n\n`;
    report += `## 问题列表\n\n`;
    
    // Only show active issues in report
    const activeIssues = result.issues.filter((_, idx) => !resolvedIndices.has(idx));
    
    if (activeIssues.length === 0) {
        report += "未发现明显问题或所有问题已处理。\n";
    } else {
        activeIssues.forEach((issue, index) => {
            report += `### ${index + 1}. ${issue.original} -> ${issue.suggestion}\n`;
            report += `- **类型**: ${typeLabels[issue.type] || issue.type}\n`;
            report += `- **原因**: ${issue.reason}\n\n`;
        });
    }

    downloadFile(report, `report-${Date.now()}.md`, 'text/markdown;charset=utf-8');
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 75) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 60) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  // --- Advanced Diff & Highlight Logic ---

  const processedDiffs = useMemo(() => {
    const rawDiffs = (originalText && originalText.length > 0) 
      ? diffChars(originalText, currentText) 
      : [{ value: currentText, added: true, removed: false } as Change];

    const issue = selectedIssueIndex !== null ? result.issues[selectedIssueIndex] : null;

    if (!issue) {
      return rawDiffs.map(d => ({ ...d, highlighted: false }));
    }

    // 1. Reconstruct texts and establish coordinate mappings
    let origText = "";
    let corrText = "";
    
    // Mapping: diff chunk index -> { start pos in orig, start pos in corr, length }
    const chunkMapping = rawDiffs.map(d => {
        const m = { 
            origStart: d.added ? -1 : origText.length, 
            corrStart: d.removed ? -1 : corrText.length,
            len: d.value.length
        };
        if (!d.added) origText += d.value;
        if (!d.removed) corrText += d.value;
        return m;
    });

    // 2. Helper to find all ranges of a substring
    const getRanges = (text: string, search: string) => {
         const ranges: [number, number][] = [];
         if (!search) return ranges;
         let idx = text.indexOf(search);
         while (idx !== -1) {
             ranges.push([idx, idx + search.length]);
             idx = text.indexOf(search, idx + 1);
         }
         return ranges;
    };

    const origMatches = getRanges(origText, issue.original);
    const corrMatches = getRanges(corrText, issue.suggestion);

    // 3. Filter Matches based on overlap with active diff chunks (removed/added)
    // This disambiguates multiple occurrences by preferring those involved in a change.
    const isComment = issue.original === issue.suggestion;
    const activeOrigRanges: [number, number][] = [];
    const activeCorrRanges: [number, number][] = [];

    const rangeOverlapsType = (start: number, end: number, type: 'removed'|'added') => {
         return rawDiffs.some((d, i) => {
             if (type === 'removed') {
                 if (d.added) return false;
                 const cStart = chunkMapping[i].origStart;
                 const cEnd = cStart + d.value.length;
                 if (Math.max(start, cStart) < Math.min(end, cEnd)) {
                     return d.removed;
                 }
             } else { // added
                 if (d.removed) return false;
                 const cStart = chunkMapping[i].corrStart;
                 const cEnd = cStart + d.value.length;
                 if (Math.max(start, cStart) < Math.min(end, cEnd)) {
                     return d.added;
                 }
             }
             return false;
         });
    };

    origMatches.forEach(r => {
        if (isComment || rangeOverlapsType(r[0], r[1], 'removed')) {
            activeOrigRanges.push(r);
        }
    });
    
    corrMatches.forEach(r => {
        if (isComment || rangeOverlapsType(r[0], r[1], 'added')) {
            activeCorrRanges.push(r);
        }
    });

    // 4. Split Diff Chunks based on Highlights
    const resultParts: RenderPart[] = [];

    rawDiffs.forEach((d, i) => {
        const { origStart, corrStart, len } = chunkMapping[i];
        
        // Boolean mask for highlighting within this chunk
        const mask = new Array(len).fill(false);

        if (!d.added) { // Exists in Original
            activeOrigRanges.forEach(([s, e]) => {
                const start = Math.max(s, origStart);
                const end = Math.min(e, origStart + len);
                if (start < end) {
                    for(let k=start; k<end; k++) mask[k - origStart] = true;
                }
            });
        }
        
        if (!d.removed) { // Exists in Corrected
             activeCorrRanges.forEach(([s, e]) => {
                const start = Math.max(s, corrStart);
                const end = Math.min(e, corrStart + len);
                if (start < end) {
                    for(let k=start; k<end; k++) mask[k - corrStart] = true;
                }
            });
        }

        // Split chunk by mask segments
        let currentStr = "";
        let currentHighlight = mask[0];

        for(let k=0; k<len; k++) {
            if (mask[k] !== currentHighlight) {
                if (currentStr) {
                    resultParts.push({ ...d, value: currentStr, highlighted: currentHighlight });
                }
                currentStr = "";
                currentHighlight = mask[k];
            }
            currentStr += d.value[k];
        }
        if (currentStr) {
             resultParts.push({ ...d, value: currentStr, highlighted: currentHighlight });
        }
    });

    return resultParts;

  }, [originalText, currentText, selectedIssueIndex, result]);


  // Render Functions
  const renderProcessedDiffs = () => {
      // In Clean mode, we filter out removed parts
      const partsToRender = viewMode === 'clean' 
        ? processedDiffs.filter(p => !p.removed)
        : processedDiffs;

      return partsToRender.map((part, index) => {
          // Base Styles
          let baseClass = "text-slate-800";
          if (part.added) {
             baseClass = "bg-green-100 text-green-800 decoration-green-400 underline decoration-2 underline-offset-2 mx-0.5 px-0.5 rounded";
          } else if (part.removed) {
             baseClass = "bg-red-50 text-red-400 line-through decoration-red-300 mx-0.5 px-0.5 rounded opacity-80";
          }

          // Highlight Overlay
          const highlightClass = part.highlighted 
            ? "bg-amber-200 ring-1 ring-amber-300 text-amber-900 shadow-sm"
            : "";
          
          // Combine: Highlight overrides background of base diff styles slightly but keeps text decoration
          // If highlighted, we replace bg color.
          const finalClass = part.highlighted 
             ? `${baseClass.replace(/bg-[\w-]+/, '')} ${highlightClass}`
             : baseClass;

          return (
            <span key={index} className={finalClass}>
              {part.value}
            </span>
          );
      });
  };

  // Filter Issues
  const filteredIssues = result.issues
    .map((issue, idx) => ({ ...issue, originalIndex: idx })) // Preserve original index
    .filter(issue => !resolvedIndices.has(issue.originalIndex)) // Hide resolved
    .filter(issue => {
        if (activeFilter === 'all') return true;
        if (activeFilter === IssueType.STYLE) {
          return issue.type === IssueType.STYLE || issue.type === IssueType.SUGGESTION;
        }
        return issue.type === activeFilter;
    });

  // Counts based on UNRESOLVED
  const currentUnresolved = result.issues.filter((_, idx) => !resolvedIndices.has(idx));
  const counts = {
    all: currentUnresolved.length,
    [IssueType.SENSITIVE]: currentUnresolved.filter(i => i.type === IssueType.SENSITIVE).length,
    [IssueType.TYPO]: currentUnresolved.filter(i => i.type === IssueType.TYPO).length,
    [IssueType.GRAMMAR]: currentUnresolved.filter(i => i.type === IssueType.GRAMMAR).length,
    [IssueType.PUNCTUATION]: currentUnresolved.filter(i => i.type === IssueType.PUNCTUATION).length,
    [IssueType.STYLE]: currentUnresolved.filter(i => i.type === IssueType.STYLE || i.type === IssueType.SUGGESTION).length,
  };

  const FilterButton = ({ type, label, count, colorClass }: { type: 'all' | IssueType, label: string, count: number, colorClass: string }) => (
    <button
      onClick={() => setActiveFilter(type)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
        activeFilter === type
          ? colorClass
          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeFilter === type ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>
        {count}
      </span>
    </button>
  );

  const canShowDiff = originalText && originalText.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* Left Column: Text Display */}
      <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          
          {/* View Toggle Tabs */}
          <div className="flex bg-slate-200/50 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('clean')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === 'clean' 
                  ? 'bg-white text-brand-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Eye className="w-4 h-4" />
              阅读模式
            </button>
            <button
              onClick={() => setViewMode('diff')}
              disabled={!canShowDiff}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === 'diff' 
                  ? 'bg-white text-brand-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              } ${!canShowDiff ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={!canShowDiff ? "图片/PDF 暂不支持修订模式" : ""}
            >
              <FileDiff className="w-4 h-4" />
              修订模式
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Export Dropdown */}
            <div className="relative" ref={exportMenuRef}>
                <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                >
                    <Download className="w-3.5 h-3.5" />
                    导出
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
                
                {showExportMenu && (
                    <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 duration-100">
                        <button 
                            onClick={handleExportText}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600"
                        >
                            仅校对文本 (.txt)
                        </button>
                        <button 
                            onClick={handleExportReport}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600"
                        >
                            完整报告 (.md)
                        </button>
                    </div>
                )}
            </div>

            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                copied 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '已复制' : '复制全文'}
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 text-base leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
            <div className="font-sans text-base leading-loose">
              {renderProcessedDiffs()}
            </div>
        </div>
        
        {viewMode === 'diff' && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs flex gap-4 text-slate-500">
             <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm block"></span> 删除内容</span>
             <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 border border-green-200 rounded-sm block"></span> 新增内容</span>
          </div>
        )}
      </div>

      {/* Right Column: Analysis & Issues */}
      <div className="flex flex-col h-full gap-4 overflow-hidden">
        
        {/* Score & Summary Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-700">质量评估</h3>
            <div className={`px-3 py-1 rounded-full text-sm font-bold border ${getScoreColor(result.score)}`}>
              {result.score} 分
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            <span className="font-medium text-slate-900 mr-2">总结:</span>
            {result.summary}
          </p>
        </div>

        {/* Issues List */}
        <div className="flex flex-col flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
           <div className="p-4 border-b border-slate-200 bg-white">
             <div className="flex items-center justify-between mb-3">
               <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                 <AlertTriangle className="w-5 h-5 text-amber-500" />
                 问题列表
               </h3>

               {/* Batch Actions */}
               {filteredIssues.length > 0 && (
                 <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleBatchAction('accept')}
                        className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded transition-colors"
                        title="采纳当前列表中的所有建议"
                    >
                        <CheckCheck className="w-3.5 h-3.5" />
                        全部采纳
                    </button>
                    <button
                        onClick={() => handleBatchAction('ignore')}
                        className="flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 px-2 py-1 rounded transition-colors"
                        title="忽略当前列表中的所有问题"
                    >
                        <ListX className="w-3.5 h-3.5" />
                        全部忽略
                    </button>
                 </div>
               )}
             </div>
             
             {/* Filter Bar */}
             <div className="flex flex-wrap gap-2">
                <FilterButton type="all" label="全部" count={counts.all} colorClass="bg-slate-800 text-white border-slate-800" />
                <FilterButton type={IssueType.SENSITIVE} label="合规/敏感" count={counts[IssueType.SENSITIVE]} colorClass="bg-rose-600 text-white border-rose-600" />
                <FilterButton type={IssueType.TYPO} label="错别字" count={counts[IssueType.TYPO]} colorClass="bg-red-500 text-white border-red-500" />
                <FilterButton type={IssueType.GRAMMAR} label="语病" count={counts[IssueType.GRAMMAR]} colorClass="bg-orange-500 text-white border-orange-500" />
                <FilterButton type={IssueType.PUNCTUATION} label="标点" count={counts[IssueType.PUNCTUATION]} colorClass="bg-blue-500 text-white border-blue-500" />
                <FilterButton type={IssueType.STYLE} label="风格建议" count={counts[IssueType.STYLE]} colorClass="bg-purple-500 text-white border-purple-500" />
             </div>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {filteredIssues.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10">
                 <ThumbsUp className="w-12 h-12 mb-3 text-slate-300" />
                 <p>{counts.all === 0 ? "太棒了！没有发现明显错误。" : "该分类下没有发现问题。"}</p>
               </div>
             ) : (
               filteredIssues.map((issue) => (
                 <div key={issue.originalIndex} className="animate-slide-in-right opacity-0" style={{ animationDelay: '0.05s' }}>
                   <IssueCard 
                      issue={issue}
                      isSelected={selectedIssueIndex === issue.originalIndex}
                      onClick={() => setSelectedIssueIndex(prev => prev === issue.originalIndex ? null : issue.originalIndex)}
                      onAccept={(e) => { e.stopPropagation(); handleAction(issue.originalIndex, 'accept', issue.original, issue.suggestion); }}
                      onIgnore={(e) => { e.stopPropagation(); handleAction(issue.originalIndex, 'ignore', issue.original, issue.suggestion); }}
                      onWhitelist={(e) => { e.stopPropagation(); handleAction(issue.originalIndex, 'whitelist', issue.original, issue.suggestion); }}
                   />
                 </div>
               ))
             )}
           </div>
        </div>
      </div>
    </div>
  );
};