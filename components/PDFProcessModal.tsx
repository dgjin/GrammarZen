import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Layers, CheckSquare, Square, MousePointerClick, RefreshCw, ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react';

interface PDFProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  totalPages: number;
  pdfDocument?: any; // PDFDocumentProxy
  onConfirm: (pages: number[], scale: number) => void;
}

export const PDFProcessModal: React.FC<PDFProcessModalProps> = ({
  isOpen,
  onClose,
  fileName,
  totalPages,
  pdfDocument,
  onConfirm
}) => {
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState('');
  const [scale, setScale] = useState(1.5); // Default to clear quality
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [fitToWidth, setFitToWidth] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(false);

  // Initialize selection
  useEffect(() => {
    if (isOpen) {
        // Default: Select all
        const all = new Set<number>();
        for(let i=1; i<=totalPages; i++) all.add(i);
        setSelectedPages(all);
        setRangeInput(`1-${totalPages}`);
        setPreviewPage(1);
    }
  }, [isOpen, totalPages]);

  // Render Preview
  useEffect(() => {
      if (!isOpen || !pdfDocument || !previewPage) return;

      let isCancelled = false;
      const renderThumbnail = async () => {
          setRendering(true);
          try {
              const page = await pdfDocument.getPage(previewPage);
              if (isCancelled) return;
              
              // Use selected scale for rendering to show actual quality
              const viewport = page.getViewport({ scale: scale });
              const canvas = canvasRef.current;
              if (!canvas) return;

              const context = canvas.getContext('2d');
              if (!context) return;

              canvas.height = viewport.height;
              canvas.width = viewport.width;

              await page.render({ canvasContext: context, viewport }).promise;
          } catch (err) {
              console.warn("Preview render failed", err);
          } finally {
              if (!isCancelled) setRendering(false);
          }
      };

      renderThumbnail();
      return () => { isCancelled = true; };
  }, [previewPage, pdfDocument, isOpen, scale]);

  // Handle Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isOpen) return;
        if (e.key === 'ArrowLeft') {
            setPreviewPage(prev => Math.max(1, prev - 1));
        } else if (e.key === 'ArrowRight') {
            setPreviewPage(prev => Math.min(totalPages, prev + 1));
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalPages]);


  if (!isOpen) return null;

  const toggleSelection = (pageNum: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newSet = new Set(selectedPages);
    if (newSet.has(pageNum)) {
        newSet.delete(pageNum);
    } else {
        newSet.add(pageNum);
    }
    setSelectedPages(newSet);
  };

  const handlePageClick = (pageNum: number) => {
      setPreviewPage(pageNum);
  };

  const selectAll = () => {
      const all = new Set<number>();
      for(let i=1; i<=totalPages; i++) all.add(i);
      setSelectedPages(all);
  }

  const deselectAll = () => {
      setSelectedPages(new Set());
  }

  const applyRangeInput = () => {
      const parts = rangeInput.split(/[,;，；\s]+/);
      const newSet = new Set<number>();
      
      parts.forEach(part => {
          const trimmed = part.trim();
          if (!trimmed) return;
          
          if (trimmed.includes('-')) {
              const [start, end] = trimmed.split('-').map(Number);
              if (!isNaN(start) && !isNaN(end)) {
                  const s = Math.min(start, end);
                  const e = Math.max(start, end);
                  for (let i = s; i <= e; i++) {
                      if (i >= 1 && i <= totalPages) newSet.add(i);
                  }
              }
          } else {
              const num = Number(trimmed);
              if (!isNaN(num) && num >= 1 && num <= totalPages) {
                  newSet.add(num);
              }
          }
      });
      setSelectedPages(newSet);
      
      // Preview first page of new selection
      if (newSet.size > 0) {
          setPreviewPage(Array.from(newSet)[0]);
      }
  };

  const handleConfirm = () => {
    if (selectedPages.size === 0) {
        alert("请至少选择一页");
        return;
    }
    const sorted = Array.from(selectedPages).sort((a, b) => a - b);
    onConfirm(sorted, scale);
  };

  const nextPage = () => setPreviewPage(p => Math.min(totalPages, p + 1));
  const prevPage = () => setPreviewPage(p => Math.max(1, p - 1));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
              <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-600" />
                PDF 解析设置
              </h3>
              <p className="text-xs text-slate-500 mt-1 truncate max-w-md" title={fileName}>
                 {fileName} <span className="mx-1">•</span> 共 {totalPages} 页
              </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
            
            {/* Left Column: Selection Controls */}
            <div className="w-full lg:w-96 flex flex-col border-r border-slate-100 bg-white order-1 h-1/3 lg:h-auto">
                <div className="p-4 border-b border-slate-100">
                    {/* Range Input Tool */}
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <MousePointerClick className="w-3.5 h-3.5" />
                            快速选择
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input 
                                type="text" 
                                value={rangeInput}
                                onChange={(e) => setRangeInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && applyRangeInput()}
                                placeholder="如: 1-5, 8, 10-12"
                                className="flex-1 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                            />
                            <button 
                                onClick={applyRangeInput}
                                className="px-3 py-2 bg-white border border-slate-200 hover:border-brand-300 text-slate-600 hover:text-brand-600 rounded text-sm font-medium transition-colors"
                            >
                                应用
                            </button>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={selectAll} className="text-xs text-brand-600 hover:underline">全选</button>
                            <button onClick={deselectAll} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">清空</button>
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                         <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" />
                            页面列表
                        </label>
                        <span className="text-xs text-brand-600 font-medium bg-brand-50 px-2 py-0.5 rounded-full">
                            已选 {selectedPages.size} 页
                        </span>
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
                    <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
                            const isSelected = selectedPages.has(pageNum);
                            const isPreviewing = previewPage === pageNum;
                            return (
                                <div
                                    key={pageNum}
                                    onClick={() => handlePageClick(pageNum)}
                                    className={`
                                        relative aspect-[3/4] rounded-lg border cursor-pointer transition-all group overflow-hidden
                                        ${isSelected 
                                            ? 'bg-brand-50 border-brand-500 shadow-sm' 
                                            : 'bg-white border-slate-200 hover:border-brand-300 hover:shadow-sm'
                                        }
                                        ${isPreviewing ? 'ring-2 ring-brand-400 ring-offset-1' : ''}
                                    `}
                                >
                                    {/* Selection Checkbox Area */}
                                    <div 
                                        onClick={(e) => toggleSelection(pageNum, e)}
                                        className="absolute top-0 right-0 p-1.5 z-10 hover:bg-black/5 rounded-bl-lg transition-colors"
                                    >
                                        {isSelected ? (
                                            <CheckSquare className="w-4 h-4 text-brand-600 fill-white" />
                                        ) : (
                                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                                        )}
                                    </div>
                                    
                                    {/* Center Page Num */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className={`text-sm font-medium ${isSelected ? 'text-brand-700' : 'text-slate-500'}`}>
                                            {pageNum}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Right Column: Preview */}
            <div className="flex-1 flex flex-col bg-slate-100 order-2 h-2/3 lg:h-auto border-l border-slate-200">
                 
                 {/* Preview Toolbar */}
                 <div className="px-4 py-2 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
                     <div className="flex items-center gap-2">
                        <button 
                            onClick={prevPage}
                            disabled={previewPage <= 1}
                            className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                            title="上一页 (Left Arrow)"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-600" />
                        </button>
                        <span className="text-sm font-medium text-slate-700 min-w-[4rem] text-center">
                            {previewPage} / {totalPages}
                        </span>
                        <button 
                            onClick={nextPage}
                            disabled={previewPage >= totalPages}
                            className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                            title="下一页 (Right Arrow)"
                        >
                            <ChevronRight className="w-5 h-5 text-slate-600" />
                        </button>
                     </div>
                     
                     <div className="flex items-center gap-3">
                         <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                             <button
                                onClick={() => setFitToWidth(true)}
                                className={`p-1.5 rounded-md transition-all ${fitToWidth ? 'bg-white shadow text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title="适应窗口"
                             >
                                 <Minimize className="w-4 h-4" />
                             </button>
                             <button
                                onClick={() => setFitToWidth(false)}
                                className={`p-1.5 rounded-md transition-all ${!fitToWidth ? 'bg-white shadow text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title="原始大小 (可滚动)"
                             >
                                 <Maximize className="w-4 h-4" />
                             </button>
                         </div>

                        <div className="h-4 w-px bg-slate-300 mx-1"></div>

                        <select 
                            value={scale}
                            onChange={(e) => setScale(Number(e.target.value))}
                            className="text-xs py-1.5 pl-2 pr-7 border border-slate-300 rounded-md focus:ring-1 focus:ring-brand-500 bg-white"
                        >
                            <option value={1.0}>1.0x (快速)</option>
                            <option value={1.5}>1.5x (清晰)</option>
                            <option value={2.0}>2.0x (超清)</option>
                        </select>
                     </div>
                 </div>

                 {/* Preview Canvas Container */}
                 <div className="flex-1 overflow-auto flex items-center justify-center p-4 relative bg-slate-200/50">
                     {rendering && (
                         <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20 backdrop-blur-[1px]">
                             <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
                         </div>
                     )}
                     <div 
                        className={`transition-all duration-200 bg-white shadow-xl ${fitToWidth ? 'w-full h-full flex items-center justify-center' : ''}`}
                     >
                         <canvas 
                            ref={canvasRef} 
                            className={`
                                ${fitToWidth ? 'max-w-full max-h-full object-contain' : ''}
                                bg-white
                            `}
                        />
                     </div>
                 </div>
            </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
             <div className="text-xs text-slate-500 hidden sm:block">
                 已选择 <span className="font-bold text-brand-600">{selectedPages.size}</span> 页用于识别
             </div>
             <div className="flex gap-3 w-full sm:w-auto justify-end">
                <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors">取消</button>
                <button 
                    onClick={handleConfirm} 
                    className="px-6 py-2 bg-brand-600 text-white hover:bg-brand-700 rounded-lg text-sm font-medium shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={selectedPages.size === 0}
                >
                    确认解析
                </button>
             </div>
        </div>
      </div>
    </div>
  );
};