import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ProofreadResult, IssueType, Issue } from '../types';
import { IssueCard } from './IssueCard';
import { Copy, Check, ThumbsUp, AlertTriangle, FileDiff, Eye, Download, ChevronDown, CheckCheck, ListX, FileText, Maximize2, Minimize2, File as FileIcon, FileImage } from 'lucide-react';
import { diffChars, Change } from 'diff';
import { Attachment } from '../App';

interface ResultViewProps {
  result: ProofreadResult;
  originalText: string;
  onAddToWhitelist: (word: string) => void;
  attachment: Attachment | null;
}

// Extended Diff Part with highlight flag
interface RenderPart extends Change {
  highlighted?: boolean;
  issueIndex?: number; // Always present if related to an issue
  clickable?: boolean; // Can trigger selection
}

// Simple throttle hook
function useThrottle<T extends (...args: any[]) => void>(func: T, delay: number): T {
  const lastRun = useRef(0);
  const timeout = useRef<NodeJS.Timeout | null>(null);

  return useCallback((...args: any[]) => {
    const now = Date.now();
    if (now - lastRun.current >= delay) {
      func(...args);
      lastRun.current = now;
    } else {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        func(...args);
        lastRun.current = Date.now();
      }, delay - (now - lastRun.current));
    }
  }, [func, delay]) as T;
}

export const ResultView: React.FC<ResultViewProps> = ({ result, originalText, onAddToWhitelist, attachment }) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'clean' | 'diff'>('clean');
  const [activeFilter, setActiveFilter] = useState<'all' | IssueType>('all');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showAttachment, setShowAttachment] = useState(false);
  
  // State for interactive proofreading
  const [resolvedIndices, setResolvedIndices] = useState<Set<number>>(new Set());
  const [currentText, setCurrentText] = useState(result.correctedText);
  const [issueStatus, setIssueStatus] = useState<Record<number, 'accepted' | 'ignored' | 'whitelisted'>>({});
  
  // Highlight State
  const [selectedIssueIndex, setSelectedIssueIndex] = useState<number | null>(null);
  const [selectionSource, setSelectionSource] = useState<'text' | 'list' | null>(null);

  // Scroll Refs
  const textContainerRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);

  // Sync state if result changes
  useEffect(() => {
    setResolvedIndices(new Set());
    setIssueStatus({});
    setCurrentText(result.correctedText);
    setSelectedIssueIndex(null);
    setSelectionSource(null);
  }, [result]);

  // Reset selection on filter change to avoid pointing to hidden issues
  useEffect(() => {
    setSelectedIssueIndex(null);
  }, [activeFilter]);
  
  // Effect to scroll to highlighted issue in TEXT view
  useEffect(() => {
    if (selectedIssueIndex !== null && selectionSource !== 'text') {
      const el = document.getElementById(`diff-ref-${selectedIssueIndex}`);
      if (el && textContainerRef.current) {
        isAutoScrolling.current = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Reset lock after animation approx time
        setTimeout(() => { isAutoScrolling.current = false; }, 800);
      }
    }
  }, [selectedIssueIndex, viewMode, selectionSource]);

  // Effect to scroll to selected issue in LIST view
  useEffect(() => {
    if (selectedIssueIndex !== null && selectionSource === 'text') {
      const card = document.getElementById(`issue-card-${selectedIssueIndex}`);
      if (card && listContainerRef.current) {
        isAutoScrolling.current = true;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { isAutoScrolling.current = false; }, 800);
      }
    }
  }, [selectedIssueIndex, selectionSource]);

  // --- Filter Logic ---
  const filteredIssues = useMemo(() => result.issues
    .map((issue, idx) => ({ ...issue, originalIndex: idx }))
    .filter(issue => !resolvedIndices.has(issue.originalIndex))
    .filter(issue => {
        if (activeFilter === 'all') return true;
        if (activeFilter === IssueType.STYLE) {
          return issue.type === IssueType.STYLE || issue.type === IssueType.SUGGESTION;
        }
        return issue.type === activeFilter;
    }), [result.issues, resolvedIndices, activeFilter]);

  // --- Scroll Handlers ---

  const handleTextScroll = useThrottle(() => {
    if (isAutoScrolling.current || !textContainerRef.current) return;
    
    const containerRect = textContainerRef.current.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    
    let closestIndex: number | null = null;
    let minDistance = Infinity;

    // Find the issue closest to the center of the view
    filteredIssues.forEach(issue => {
      const el = document.getElementById(`diff-ref-${issue.originalIndex}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Only consider elements that are visible or close to visible
        if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
             const dist = Math.abs((rect.top + rect.height / 2) - centerY);
             if (dist < minDistance) {
                minDistance = dist;
                closestIndex = issue.originalIndex;
             }
        }
      }
    });

    if (closestIndex !== null && closestIndex !== selectedIssueIndex) {
        setSelectionSource('text'); // Claim source as text
        setSelectedIssueIndex(closestIndex);
    }
  }, 200);

  const handleListScroll = useThrottle(() => {
    if (isAutoScrolling.current || !listContainerRef.current) return;

    const containerRect = listContainerRef.current.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;

    let closestIndex: number | null = null;
    let minDistance = Infinity;

    filteredIssues.forEach(issue => {
        const card = document.getElementById(`issue-card-${issue.originalIndex}`);
        if (card) {
            const rect = card.getBoundingClientRect();
            if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
                const dist = Math.abs((rect.top + rect.height / 2) - centerY);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestIndex = issue.originalIndex;
                }
            }
        }
    });

    if (closestIndex !== null && closestIndex !== selectedIssueIndex) {
        setSelectionSource('list'); // Claim source as list
        setSelectedIssueIndex(closestIndex);
    }
  }, 200);


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

      if (action === 'ignore' || action === 'whitelist') {
          setCurrentText(prev => prev.replace(issueSuggestion, issueOriginal));
          if (action === 'whitelist') {
              onAddToWhitelist(issueOriginal);
          }
      }
  };

  const handleBatchAction = (action: 'accept' | 'ignore') => {
    const targets = filteredIssues; // Use pre-calculated filtered issues

    if (targets.length === 0) return;

    const newResolvedIndices = new Set(resolvedIndices);
    const newIssueStatus = { ...issueStatus };
    let newText = currentText;

    targets.forEach(issue => {
        const idx = issue.originalIndex;
        newResolvedIndices.add(idx);
        newIssueStatus[idx] = action === 'accept' ? 'accepted' : 'ignored';

        if (action === 'ignore') {
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

  const handleExportWord = () => {
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <style>
          body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; }
          p { margin-bottom: 1em; line-height: 1.6; }
        </style>
      </head>
      <body>`;
    const footer = "</body></html>";
    
    const contentHtml = currentText.split('\n').map(line => {
        if (!line.trim()) return ''; 
        return `<p>${line}</p>`;
    }).join('');
    
    const sourceHTML = header + contentHtml + footer;
    downloadFile(sourceHTML, `grammarzen-export-${Date.now()}.doc`, 'application/msword');
  };

  const generateReportContent = () => {
    const typeLabels: Record<string, string> = {
      [IssueType.SENSITIVE]: "敏感/合规",
      [IssueType.PRIVACY]: "隐私安全",
      [IssueType.FORMAT]: "格式/字体",
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
    return report;
  };

  const handleExportReport = () => {
    const report = generateReportContent();
    downloadFile(report, `report-${Date.now()}.md`, 'text/markdown;charset=utf-8');
  };

  const handleCopyReport = () => {
    const report = generateReportContent();
    navigator.clipboard.writeText(report);
    setShowExportMenu(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 75) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 60) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  // --- Advanced Diff & Highlight Logic ---

  // 1. Calculate precise locations of issues
  const issueLocations = useMemo(() => {
    if (!result || !originalText) return [];
    
    const changes = diffChars(originalText, result.correctedText);
    
    const blocks: { origStart: number, origEnd: number, origText: string, corrText: string }[] = [];
    let currentBlock: { origStart: number, origEnd: number, origText: string, corrText: string } | null = null;
    let oIdx = 0;
    
    for (const change of changes) {
        if (change.added || change.removed) {
            if (!currentBlock) {
                currentBlock = { origStart: oIdx, origEnd: oIdx, origText: "", corrText: "" };
            }
            if (change.removed) {
                currentBlock.origText += change.value;
                currentBlock.origEnd += change.value.length;
            }
            if (change.added) {
                currentBlock.corrText += change.value;
            }
        } else {
            if (currentBlock) {
                blocks.push(currentBlock);
                currentBlock = null;
            }
            oIdx += change.value.length;
        }
        if (change.removed) oIdx += change.value.length;
    }
    if (currentBlock) blocks.push(currentBlock);
    
    const locations = result.issues.map(() => ({ start: -1, end: -1 }));
    let blockCursor = 0;
    
    result.issues.forEach((issue, idx) => {
        for (let i = blockCursor; i < blocks.length; i++) {
            const block = blocks[i];
            const origMatch = block.origText.indexOf(issue.original);
            const corrMatch = block.corrText.indexOf(issue.suggestion);

            const hasMatch = (issue.original && origMatch !== -1) || (issue.suggestion && corrMatch !== -1);
            
            if (hasMatch) {
                if (issue.original && origMatch !== -1) {
                    locations[idx] = {
                        start: block.origStart + origMatch,
                        end: block.origStart + origMatch + issue.original.length
                    };
                } else {
                    locations[idx] = {
                        start: block.origStart,
                        end: block.origStart
                    };
                }
                blockCursor = i; 
                return;
            }
        }
    });
    return locations;
  }, [originalText, result]);

  // 2. Generate Renderable Diff Parts
  const processedDiffs = useMemo(() => {
    const rawDiffs = (originalText && originalText.length > 0) 
      ? diffChars(originalText, currentText) 
      : [{ value: currentText, added: true, removed: false } as Change];
    
    const issue = selectedIssueIndex !== null ? result.issues[selectedIssueIndex] : null;
    const target = selectedIssueIndex !== null ? issueLocations[selectedIssueIndex] : null;

    // Helper: find issue respecting FILTER
    const getIssueIndex = (start: number, end: number, isAdded: boolean): number | undefined => {
        for (let i = 0; i < issueLocations.length; i++) {
             if (resolvedIndices.has(i)) continue; // Skip resolved

             // Check Filter
             const issueCheck = result.issues[i];
             if (activeFilter !== 'all') {
                if (activeFilter === IssueType.STYLE) {
                    if (issueCheck.type !== IssueType.STYLE && issueCheck.type !== IssueType.SUGGESTION) continue;
                } else if (issueCheck.type !== activeFilter) {
                    continue;
                }
             }

             const loc = issueLocations[i];
             if (isAdded) {
                 if (start >= loc.start && start <= loc.end) return i;
             } else {
                 const overlapStart = Math.max(start, loc.start);
                 const overlapEnd = Math.min(end, loc.end);
                 if (overlapStart < overlapEnd) return i;
             }
        }
        return undefined;
    };

    const resultParts: RenderPart[] = [];
    let currentOrigIndex = 0;

    rawDiffs.forEach(d => {
        if (!d.added && !d.removed) {
            resultParts.push({ ...d, highlighted: false });
            currentOrigIndex += d.value.length;
            return;
        }

        if (d.removed) {
             const chunkStart = currentOrigIndex;
             const chunkEnd = currentOrigIndex + d.value.length;
             
             // Check overlapping range with TARGET (Selected Issue)
             const overlapStart = target ? Math.max(chunkStart, target.start) : -1;
             const overlapEnd = target ? Math.min(chunkEnd, target.end) : -1;
             
             if (target && overlapStart < overlapEnd) {
                 const preLen = overlapStart - chunkStart;
                 const highLen = overlapEnd - overlapStart;
                 
                 if (preLen > 0) {
                     const pStart = chunkStart;
                     const pEnd = chunkStart + preLen;
                     resultParts.push({ 
                         ...d, 
                         value: d.value.substring(0, preLen), 
                         highlighted: false,
                         clickable: true,
                         issueIndex: getIssueIndex(pStart, pEnd, false) 
                     });
                 }
                 
                 resultParts.push({ 
                     ...d, 
                     value: d.value.substring(preLen, preLen + highLen), 
                     highlighted: true,
                     clickable: false,
                     issueIndex: selectedIssueIndex ?? undefined 
                 });
                 
                 if (preLen + highLen < d.value.length) {
                     const pStart = chunkStart + preLen + highLen;
                     const pEnd = chunkEnd;
                     resultParts.push({ 
                        ...d, 
                        value: d.value.substring(preLen + highLen), 
                        highlighted: false,
                        clickable: true,
                        issueIndex: getIssueIndex(pStart, pEnd, false)
                     });
                 }
             } else {
                 resultParts.push({ 
                     ...d, 
                     highlighted: false,
                     clickable: true,
                     issueIndex: getIssueIndex(chunkStart, chunkEnd, false)
                 });
             }
             
             currentOrigIndex += d.value.length;
             return;
        }

        if (d.added) {
             if (target && currentOrigIndex >= target.start && currentOrigIndex <= target.end) {
                 const idx = issue?.suggestion ? d.value.indexOf(issue.suggestion) : -1;
                 
                 if (idx !== -1) {
                     if (idx > 0) resultParts.push({ 
                         ...d, 
                         value: d.value.substring(0, idx), 
                         highlighted: false,
                         clickable: true,
                         issueIndex: getIssueIndex(currentOrigIndex, currentOrigIndex, true)
                     });
                     
                     resultParts.push({ 
                         ...d, 
                         value: d.value.substring(idx, idx + (issue?.suggestion.length || 0)), 
                         highlighted: true,
                         clickable: false,
                         issueIndex: selectedIssueIndex ?? undefined
                     });
                     
                     if (idx + (issue?.suggestion.length || 0) < d.value.length) resultParts.push({ 
                         ...d, 
                         value: d.value.substring(idx + (issue?.suggestion.length || 0)), 
                         highlighted: false,
                         clickable: true,
                         issueIndex: getIssueIndex(currentOrigIndex, currentOrigIndex, true)
                     });
                 } else {
                     resultParts.push({ ...d, highlighted: true, clickable: false, issueIndex: selectedIssueIndex ?? undefined });
                 }
             } else {
                 resultParts.push({ 
                     ...d, 
                     highlighted: false,
                     clickable: true,
                     issueIndex: getIssueIndex(currentOrigIndex, currentOrigIndex, true)
                 });
             }
             return;
        }
    });

    return resultParts;

  }, [originalText, currentText, selectedIssueIndex, issueLocations, result, resolvedIndices, activeFilter]);


  // Render Functions
  const renderProcessedDiffs = () => {
      // In Clean mode, filter out removed parts but keep parts needed for highlighting added text
      const partsToRender = viewMode === 'clean' 
        ? processedDiffs.filter(p => !p.removed)
        : processedDiffs;

      return partsToRender.map((part, index) => {
          let baseClass = "text-slate-800";
          if (part.added) {
             baseClass = "bg-green-100 text-green-800 decoration-green-400 underline decoration-2 underline-offset-2 mx-0.5 px-0.5 rounded";
          } else if (part.removed) {
             baseClass = "bg-red-50 text-red-400 line-through decoration-red-300 mx-0.5 px-0.5 rounded opacity-80";
          }

          const highlightClass = part.highlighted 
            ? "bg-yellow-200 ring-2 ring-yellow-400 text-yellow-900 font-medium z-10 relative shadow-sm"
            : "";
          
          // It is clickable if it has an issueIndex and is not already highlighted (or even if highlighted, maybe we want to allow re-clicking?)
          // But 'part.clickable' from processedDiffs logic handles distinguishing context from target.
          // IMPORTANT: If we want scroll to work, we need ID on ALL parts that have issueIndex.
          const hasIssue = part.issueIndex !== undefined;

          const finalClass = part.highlighted 
             ? `${baseClass.replace(/bg-[\w-]+/, '')} ${highlightClass}`
             : baseClass;

          return (
            <span 
              key={index} 
              id={hasIssue ? `diff-ref-${part.issueIndex}` : undefined} 
              className={`${finalClass} ${hasIssue ? 'cursor-pointer hover:bg-yellow-100' : ''}`}
              onClick={hasIssue ? (e) => {
                  e.stopPropagation();
                  setSelectionSource('text');
                  setSelectedIssueIndex(part.issueIndex ?? null);
              } : undefined}
              title={hasIssue ? "点击定位到问题" : undefined}
            >
              {part.value}
            </span>
          );
      });
  };

  // Counts based on UNRESOLVED
  const currentUnresolved = result.issues.filter((_, idx) => !resolvedIndices.has(idx));
  const counts = {
    all: currentUnresolved.length,
    [IssueType.SENSITIVE]: currentUnresolved.filter(i => i.type === IssueType.SENSITIVE).length,
    [IssueType.PRIVACY]: currentUnresolved.filter(i => i.type === IssueType.PRIVACY).length,
    [IssueType.FORMAT]: currentUnresolved.filter(i => i.type === IssueType.FORMAT).length,
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
  
  const charCount = currentText.length;
  const diffCount = currentText.length - (originalText?.length || 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[85vh] min-h-[500px]">
      {/* Left Column: Text Display */}
      <div className={`
          flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300
          ${isFullScreen ? 'fixed inset-0 z-50 rounded-none h-screen w-screen' : 'h-full'}
      `}>
        <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          
          <div className="flex items-center gap-3">
             {/* View Mode Tabs */}
             {!showAttachment && (
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
                  阅读
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
                  修订
                  </button>
              </div>
             )}

            {/* Attachment Toggle */}
            {attachment && (
              <div className="flex bg-slate-200/50 p-1 rounded-lg">
                <button
                  onClick={() => setShowAttachment(false)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    !showAttachment
                    ? 'bg-white text-brand-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  文本
                </button>
                <button
                  onClick={() => setShowAttachment(true)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    showAttachment
                    ? 'bg-white text-brand-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileImage className="w-4 h-4" />
                  原文件
                </button>
              </div>
            )}
             
             {!showAttachment && (
                <div className="text-xs text-slate-400 font-mono mx-3 hidden sm:block">
                    {charCount} 字
                    {diffCount !== 0 && (
                        <span className={`ml-1 font-medium ${diffCount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {diffCount > 0 ? '+' : ''}{diffCount}
                        </span>
                    )}
                </div>
             )}
          </div>

          <div className="flex items-center gap-2">
            <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-white rounded-md transition-colors"
                title={isFullScreen ? "退出全屏" : "全屏阅读"}
            >
                {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <div className="w-px h-4 bg-slate-300 mx-1"></div>
            <div className="relative" ref={exportMenuRef}>
                <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">导出</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
                {showExportMenu && (
                    <div className="absolute top-full right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 duration-100">
                        <button 
                            onClick={handleExportText}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 flex items-center gap-2"
                        >
                            <FileText className="w-3.5 h-3.5 opacity-70" />
                            仅校对文本 (.txt)
                        </button>
                        <button 
                            onClick={handleExportWord}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 flex items-center gap-2"
                        >
                            <FileText className="w-3.5 h-3.5 opacity-70 text-blue-600" />
                            Word 文档 (.doc)
                        </button>
                        <button 
                            onClick={handleExportReport}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 flex items-center gap-2"
                        >
                            <FileText className="w-3.5 h-3.5 opacity-70 text-purple-600" />
                            完整报告 (.md)
                        </button>
                        <div className="h-px bg-slate-100 my-1" />
                        <button 
                            onClick={handleCopyReport}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 flex items-center gap-2"
                        >
                            <Copy className="w-3.5 h-3.5 opacity-70 text-teal-600" />
                            复制报告内容
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
              <span className="hidden sm:inline">{copied ? '已复制' : '复制'}</span>
            </button>
          </div>
        </div>

        <div 
          ref={textContainerRef}
          onScroll={handleTextScroll}
          className="flex-1 overflow-y-auto bg-white/50 relative scroll-smooth"
        >
            {showAttachment && attachment ? (
                <div className="h-full w-full bg-slate-100 flex flex-col items-center p-8 overflow-y-auto">
                    {attachment.visualData && attachment.visualData.length > 0 ? (
                        <div className="space-y-4 w-full max-w-4xl">
                             {attachment.visualData.map((data, idx) => {
                                 const srcPrefix = attachment.mimeType === 'application/pdf' ? 'data:image/jpeg;base64,' : `data:${attachment.mimeType};base64,`;
                                 return (
                                     <div key={idx} className="bg-white shadow-md rounded-lg p-2">
                                        <img 
                                          src={`${srcPrefix}${data}`} 
                                          alt={`Page ${idx + 1}`} 
                                          className="w-full h-auto object-contain"
                                        />
                                        <p className="text-center text-xs text-slate-400 mt-2">Page {idx+1}</p>
                                     </div>
                                 );
                             })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                             <FileIcon className="w-16 h-16 mb-4 text-slate-300" />
                             <p className="font-medium text-lg">无法预览此文件格式</p>
                             <p className="text-sm mt-1">{attachment.name}</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-5 text-base leading-relaxed text-slate-800 whitespace-pre-wrap font-sans min-h-full">
                    {renderProcessedDiffs()}
                </div>
            )}
        </div>
        
        {!showAttachment && viewMode === 'diff' && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs flex gap-4 text-slate-500 shrink-0">
             <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm block"></span> 删除内容</span>
             <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 border border-green-200 rounded-sm block"></span> 新增内容</span>
             <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-200 ring-1 ring-yellow-400 rounded-sm block"></span> 当前选中问题</span>
          </div>
        )}
      </div>

      {/* Right Column: Analysis & Issues */}
      <div className={`flex flex-col h-full gap-4 overflow-hidden ${isFullScreen ? 'hidden' : ''}`}>
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

        <div className="flex flex-col flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
           <div className="p-4 border-b border-slate-200 bg-white shrink-0">
             <div className="flex items-center justify-between mb-3">
               <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                 <AlertTriangle className="w-5 h-5 text-amber-500" />
                 问题列表
               </h3>
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
             
             <div className="flex flex-wrap gap-2">
                <FilterButton type="all" label="全部" count={counts.all} colorClass="bg-slate-800 text-white border-slate-800" />
                <FilterButton type={IssueType.SENSITIVE} label="合规/敏感" count={counts[IssueType.SENSITIVE]} colorClass="bg-rose-600 text-white border-rose-600" />
                <FilterButton type={IssueType.PRIVACY} label="隐私安全" count={counts[IssueType.PRIVACY]} colorClass="bg-amber-500 text-white border-amber-500" />
                <FilterButton type={IssueType.FORMAT} label="格式/字体" count={counts[IssueType.FORMAT]} colorClass="bg-slate-500 text-white border-slate-500" />
                <FilterButton type={IssueType.TYPO} label="错别字" count={counts[IssueType.TYPO]} colorClass="bg-red-500 text-white border-red-500" />
                <FilterButton type={IssueType.GRAMMAR} label="语病" count={counts[IssueType.GRAMMAR]} colorClass="bg-orange-500 text-white border-orange-500" />
                <FilterButton type={IssueType.PUNCTUATION} label="标点" count={counts[IssueType.PUNCTUATION]} colorClass="bg-blue-500 text-white border-blue-500" />
                <FilterButton type={IssueType.STYLE} label="风格建议" count={counts[IssueType.STYLE]} colorClass="bg-purple-500 text-white border-purple-500" />
             </div>
           </div>
           
           <div 
             ref={listContainerRef}
             onScroll={handleListScroll}
             className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"
           >
             {filteredIssues.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10">
                 <ThumbsUp className="w-12 h-12 mb-3 text-slate-300" />
                 <p>{counts.all === 0 ? "太棒了！没有发现明显错误。" : "该分类下没有发现问题。"}</p>
               </div>
             ) : (
               filteredIssues.map((issue) => (
                 <div key={issue.originalIndex} className="animate-slide-in-right opacity-0" style={{ animationDelay: '0.05s' }}>
                   <IssueCard 
                      id={`issue-card-${issue.originalIndex}`}
                      issue={issue}
                      isSelected={selectedIssueIndex === issue.originalIndex}
                      onClick={() => {
                          setSelectionSource('list');
                          setSelectedIssueIndex(prev => prev === issue.originalIndex ? null : issue.originalIndex);
                      }}
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