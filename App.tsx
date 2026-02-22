import React, { useState, useRef, useEffect } from 'react';
import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { checkChineseText, Part, CheckMode } from './services/geminiService';
import { ProofreadResult, LoadingState, RuleLibrary, HistoryRecord } from './types';
import { ResultView } from './components/ResultView';
import { RuleManagerModal } from './components/RuleManagerModal';
import { SensitiveWordsModal } from './components/SensitiveWordsModal';
import { PDFProcessModal } from './components/PDFProcessModal';
import { HelpModal } from './components/HelpModal';
import { AuthModal } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { PolishingModal } from './components/PolishingModal';
import { HistoryModal } from './components/HistoryModal';
import { 
  Wand2, Eraser, AlertCircle, BookOpenCheck, Upload, FileText, X, FileImage, 
  FileType, Sparkles, Zap, ShieldCheck, Trash2, Book, ShieldAlert, Cpu, 
  ChevronDown, FileBadge, PenTool, LayoutTemplate, Check, Loader2, FileSearch, 
  HelpCircle, MessageSquarePlus, LogIn, GraduationCap, Briefcase, Palette, Coffee, Layers, History
} from 'lucide-react';
import { supabase, loadUserConfig, loadRuleLibraries, saveWhitelist, saveSensitiveWords, addRuleLibrary, deleteRuleLibrary, saveHistoryRecord } from './services/supabaseService';

// Configure PDF.js worker
GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

const EXAMPLE_TEXT = "我们的产品质量非常优秀，深受客户们的喜爱。但是，在使用过程中，难免会出现一些小问题。比如，链接不稳定、界面卡顿等等。希望大家能够谅解。我们会竟快修复这些bug，保证给大家一个完美得体验。";

export interface Attachment {
  name: string;
  mimeType: string;
  data: string; // Base64 (Full file content)
  size: number;
  visualData?: string[]; // Optional visual representation (Array of Base64 images for selected pages)
}

// Basic RTF to Text parser
const parseRTF = (rtf: string): string => {
    // 1. Replace newlines/tabs
    let text = rtf.replace(/\\par[d]?/g, '\n')
                  .replace(/\\tab/g, '\t')
                  .replace(/\\line/g, '\n')
                  .replace(/\\row/g, '\n');
    
    // 2. Remove group blocks that are likely headers/fonts/stylesheets (heuristics)
    text = text.replace(/\{\\fonttbl.*?\}\}/g, '')
               .replace(/\{\\colortbl.*?\}\}/g, '')
               .replace(/\{\\stylesheet.*?\}\}/g, '');

    // 3. Decode hex characters
    text = text.replace(/\\'[0-9a-fA-F]{2}/g, (match) => {
        try {
            return String.fromCharCode(parseInt(match.slice(2), 16));
        } catch (e) {
            return match;
        }
    });
    
    // 4. Remove other control words
    text = text.replace(/\\([a-z]{1,32})(-?\d{1,10})?[ ]?/g, '');
    
    // 5. Remove remaining braces and cleanup
    text = text.replace(/[{}]/g, '')
               .replace(/\\/g, '') // leftover backslashes
               .trim();

    // 6. Cleanup multiple newlines
    return text.replace(/\n\s*\n/g, '\n\n');
};

export default function App() {
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<CheckMode>('fast');
  const [modelName, setModelName] = useState('gemini-3-flash-preview');
  const [userPrompt, setUserPrompt] = useState('');
  const [polishingTone, setPolishingTone] = useState<string>('general');
  
  // File Upload State
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [progressLabel, setProgressLabel] = useState('上传');

  // PDF Processing State
  const [pendingPDF, setPendingPDF] = useState<{ file: File, doc: any, base64: string } | null>(null);
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState(0);

  // Data & Auth State
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [showWhitelistModal, setShowWhitelistModal] = useState(false);
  const [sensitiveWords, setSensitiveWords] = useState<string[]>([]);
  const [showSensitiveModal, setShowSensitiveModal] = useState(false);
  const [ruleLibraries, setRuleLibraries] = useState<RuleLibrary[]>([]);
  const [selectedLibIds, setSelectedLibIds] = useState<Set<string>>(new Set());
  const [showRuleManager, setShowRuleManager] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Help Modal State
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Partial Polishing State
  const [selection, setSelection] = useState<{ text: string, top: number, left: number, start: number, end: number } | null>(null);
  const [showPolishingModal, setShowPolishingModal] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Auth & Data Loading ---
  
  // Initialize Auth Listener
  useEffect(() => {
    if (!supabase) return;

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'USER_UPDATED') {
          // Force refresh user state to reflect metadata changes
          setUser(session?.user ?? null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load Data whenever User changes (or on mount for anonymous)
  useEffect(() => {
    const fetchUserData = async () => {
        // Load Config (Whitelist, Sensitive Words)
        const config = await loadUserConfig(user?.id);
        setWhitelist(config.whitelist);
        setSensitiveWords(config.sensitive_words);

        // Load Rules
        const rules = await loadRuleLibraries(user?.id);
        setRuleLibraries(rules);
    };

    fetchUserData();
  }, [user]);

  // Handle Selection Logic
  useEffect(() => {
    const handleSelectionChange = () => {
        const activeEl = document.activeElement;
        
        // If we are clicking a button or modal, don't clear selection yet
        if (activeEl && (activeEl.closest('.polishing-trigger') || activeEl.closest('.modal-content'))) {
            return;
        }

        const textarea = textareaRef.current;
        if (!textarea) return;

        // If textarea is not focused, we might want to clear selection 
        // but only if we are not interacting with the polish button
        if (activeEl !== textarea) {
            // We'll let handleMouseUp and other interactions handle this
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        if (start === end) {
             setSelection(null);
        }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [result]);

  const handleMouseUp = (e: React.MouseEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea || result) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start !== end) {
          const text = textarea.value.substring(start, end);
          if (text.trim().length > 0) {
              const rect = textarea.getBoundingClientRect();
              const relativeTop = e.clientY - rect.top;
              const relativeLeft = e.clientX - rect.left;

              setSelection({
                  text,
                  top: relativeTop - 40, // Position slightly above cursor
                  left: relativeLeft,
                  start,
                  end
              });
          }
      } else {
          setSelection(null);
      }
  };

  const handleReplaceSelection = (newText: string) => {
      if (!selection || !textareaRef.current) return;
      
      const val = inputText;
      const before = val.substring(0, selection.start);
      const after = val.substring(selection.end);
      
      const nextVal = before + newText + after;
      setInputText(nextVal);
      setSelection(null);
      
      // Restore focus
      setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const newCursorPos = selection.start + newText.length;
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
      }, 0);
  };

  const handleLogout = async () => {
    if (supabase) {
        await supabase.auth.signOut();
        setShowProfileModal(false);
        // State updates handled by onAuthStateChange
    }
  };

  // --- Whitelist Logic ---
  const handleAddToWhitelist = (word: string) => {
    if (!whitelist.includes(word)) {
      const newWhitelist = [...whitelist, word];
      setWhitelist(newWhitelist);
      saveWhitelist(user?.id, newWhitelist);
    }
  };

  const handleRemoveFromWhitelist = (word: string) => {
    const newWhitelist = whitelist.filter(w => w !== word);
    setWhitelist(newWhitelist);
    saveWhitelist(user?.id, newWhitelist);
  };

  const clearWhitelist = () => {
      if(window.confirm("确定要清空所有白名单词汇吗？")) {
          setWhitelist([]);
          saveWhitelist(user?.id, []);
      }
  }

  // --- Sensitive Words Logic ---
  const handleAddSensitiveWord = (word: string) => {
    if (word && !sensitiveWords.includes(word)) {
      const newList = [...sensitiveWords, word];
      setSensitiveWords(newList);
      saveSensitiveWords(user?.id, newList);
    }
  };

  const handleRemoveSensitiveWord = (word: string) => {
    const newList = sensitiveWords.filter(w => w !== word);
    setSensitiveWords(newList);
    saveSensitiveWords(user?.id, newList);
  };

  const clearSensitiveWords = () => {
    setSensitiveWords([]);
    saveSensitiveWords(user?.id, []);
  };

  const handleBatchAddSensitiveWords = (newWords: string[]) => {
    const uniqueNewWords = newWords.filter(word => !sensitiveWords.includes(word));
    const dedupedNewWords = [...new Set(uniqueNewWords)];
    
    if (dedupedNewWords.length === 0) {
      alert("词库中的词汇已全部存在。");
      return;
    }

    const updatedList = [...sensitiveWords, ...dedupedNewWords];
    setSensitiveWords(updatedList);
    saveSensitiveWords(user?.id, updatedList);
    alert(`成功导入 ${dedupedNewWords.length} 个新敏感词。`);
  };

  // --- Rule Library Logic ---
  const handleAddLibrary = async (library: RuleLibrary) => {
      // Optimistic update
      const newLibs = [library, ...ruleLibraries];
      setRuleLibraries(newLibs);
      setSelectedLibIds(prev => new Set(prev).add(library.id));
      
      await addRuleLibrary(user?.id, library);
  };

  const handleDeleteLibrary = async (id: string) => {
      if(window.confirm("确定要删除这个规则库吗？")) {
          const newLibs = ruleLibraries.filter(l => l.id !== id);
          setRuleLibraries(newLibs);
          setSelectedLibIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
          });
          
          await deleteRuleLibrary(user?.id, id);
      }
  };

  const toggleLibrarySelection = (id: string) => {
      setSelectedLibIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) {
              newSet.delete(id);
          } else {
              newSet.add(id);
          }
          return newSet;
      });
  };

  // Helper: Convert Base64 to ArrayBuffer (for pdfjs/mammoth)
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  };

  // --- Check Logic ---
  const handleCheck = async () => {
    if (!inputText.trim() && !attachment) return;

    setSelection(null); // Clear any selection
    setLoadingState('loading');
    setError(null);
    setResult(null);

    try {
      let content: string | Part[];

      // Decide what to send based on Mode
      if (mode === 'format' && attachment?.visualData && attachment.visualData.length > 0) {
         content = [
            { text: inputText || "请分析这些文档图片的排版、字体、间距和格式规范。" },
            ...attachment.visualData.map(data => ({
               inlineData: { mimeType: "image/jpeg", data: data }
            }))
         ];
      } else if (mode === 'file_scan' && attachment && attachment.data) {
        const textOnlyMimes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/rtf', 'application/rtf'];
        if (textOnlyMimes.includes(attachment.mimeType)) {
             content = inputText || "（未提取到有效文本）";
        } else {
             content = [
                { text: inputText || "请直接分析上传的文件内容，不需要进行 OCR 转换。" },
                { inlineData: { mimeType: attachment.mimeType, data: attachment.data } }
             ];
        }
      } else if (attachment && attachment.data) {
        const textOnlyMimes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/rtf', 'application/rtf'];
        if (textOnlyMimes.includes(attachment.mimeType)) {
             content = [ { text: inputText || "请校对这份文件内容。" } ];
        } else {
             content = [
               { text: inputText || "请校对这份文件内容。" },
               { inlineData: { mimeType: attachment.mimeType, data: attachment.data } }
             ];
        }
      } else {
        content = inputText;
      }

      const activeRules = ruleLibraries
        .filter(lib => selectedLibIds.has(lib.id))
        .flatMap(lib => lib.rules);

      const data = await checkChineseText(
        content, 
        mode, 
        modelName,
        whitelist,
        sensitiveWords,
        activeRules,
        userPrompt,
        polishingTone, // Pass the polishing tone
        (partialResult) => {
           setLoadingState('streaming');
           setResult(partialResult);
        }
      );
      setResult(data);
      setLoadingState('success');

      // --- SAVE HISTORY ---
      if (user) {
        saveHistoryRecord(user.id, {
          checkMode: mode,
          summary: data.summary,
          score: data.score,
          originalText: inputText || undefined,
          fileName: attachment?.name,
          fileType: attachment?.mimeType,
          resultJson: data
        });
      }

    } catch (err: any) {
      console.error(err);
      setError(`校验失败: ${err.message || '服务暂时不可用'}`);
      setLoadingState('error');
    }
  };

  const handleLoadHistoryRecord = (record: HistoryRecord) => {
      setLoadingState('success');
      setInputText(record.originalText || '');
      setResult(record.resultJson);
      setMode(record.checkMode as CheckMode);
      setError(null);
      // If it was a file, we restore basic info but not full binary content to save bandwidth/complexity
      if (record.fileName) {
          setAttachment({
              name: record.fileName,
              mimeType: record.fileType || 'application/octet-stream',
              data: '', // Not restoring full binary
              size: 0
          });
      } else {
          setAttachment(null);
      }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png', 'image/webp',
      'text/plain', 'text/rtf', 'application/rtf'
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.rtf')) { 
      setError("不支持的文件格式。请上传 PDF, Word, TXT, RTF 或图片。");
      return;
    }

    if (file.size > 10 * 1024 * 1024) { 
      setError("文件大小不能超过 10MB。");
      return;
    }

    setError(null);
    setLoadingState('idle');
    setIsUploading(true);
    setUploadProgress(0);
    setProgressLabel('上传');

    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    };

    reader.onload = async (e) => {
      const result = e.target?.result as string;
      if (!result) { setIsUploading(false); return; }
      
      const base64Data = result.split(',')[1];

      if (file.type !== 'application/pdf') { setProgressLabel('处理'); }

      if (file.type === 'application/pdf') {
        if (mode === 'file_scan') {
           setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size, visualData: [] });
           setInputText("");
           setIsUploading(false);
           if (fileInputRef.current) fileInputRef.current.value = '';
           return;
        }

        try {
            const arrayBuffer = base64ToArrayBuffer(base64Data);
            const loadingTask = getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            setPendingPDF({ file, doc: pdf, base64: base64Data });
            setPdfPageCount(pdf.numPages);
            setShowPDFModal(true);
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            console.error("PDF Parsing Error", err);
            setError("PDF 解析失败，请重试或尝试转换为图片上传。");
            setIsUploading(false);
        }
        return;
      } 
      
      else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        try {
          const arrayBuffer = base64ToArrayBuffer(base64Data);
          const mammothResult = await mammoth.extractRawText({ arrayBuffer });
          setInputText(mammothResult.value);
          setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size });
          if (textareaRef.current) textareaRef.current.focus();
        } catch (e) {
          console.error("Word extraction failed", e);
          setError("无法读取 Word 文档，请稍后重试或复制文字粘贴。");
        }
      } 
      else if (file.type === 'text/plain') {
          try {
             const arrayBuffer = base64ToArrayBuffer(base64Data);
             const textDecoder = new TextDecoder('utf-8');
             const text = textDecoder.decode(arrayBuffer);
             setInputText(text);
             setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size });
             if (textareaRef.current) textareaRef.current.focus();
          } catch (e) {
              setError("文本文件读取失败。");
          }
      }
      else if (file.type === 'application/rtf' || file.type === 'text/rtf' || file.name.endsWith('.rtf')) {
          try {
             const arrayBuffer = base64ToArrayBuffer(base64Data);
             const textDecoder = new TextDecoder('utf-8');
             const rtfContent = textDecoder.decode(arrayBuffer);
             const text = parseRTF(rtfContent);
             setInputText(text);
             setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size });
             if (textareaRef.current) textareaRef.current.focus();
          } catch (e) {
              setError("RTF 文件读取失败。");
          }
      }
      else {
         setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size, visualData: [base64Data] });
      }
      
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.onerror = () => {
        setError("文件读取出错，请重试。");
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsDataURL(file);
  };

  const handlePDFProcessConfirm = async (pages: number[], scale: number) => {
    setShowPDFModal(false);
    if (!pendingPDF) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setProgressLabel('解析');

    try {
        const { doc, file, base64 } = pendingPDF;
        let extractedText = "";
        const visualImages: string[] = [];

        for (let i = 0; i < pages.length; i++) {
            const pageNum = pages[i];
            const page = await doc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            extractedText += pageText + "\n\n";

            try {
                const viewport = page.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                if (context) {
                    await page.render({ canvasContext: context, viewport } as any).promise;
                    visualImages.push(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
                }
            } catch (visualErr) {
                console.warn(`Failed to render PDF page ${pageNum} to image`, visualErr);
            }
            setUploadProgress(Math.round(((i + 1) / pages.length) * 100));
        }

        if (extractedText.trim().length > 20) {
             setInputText(extractedText);
             setAttachment({ name: file.name, mimeType: file.type, data: base64, size: file.size, visualData: visualImages });
             if (textareaRef.current) textareaRef.current.focus();
        } else {
             setAttachment({ name: file.name, mimeType: file.type, data: base64, size: file.size, visualData: visualImages });
             setError("未能提取有效文本（可能是扫描件），已切换为纯视觉模式。");
        }

    } catch (e) {
        console.error("PDF Processing Error", e);
        setError("PDF 处理过程中发生错误，请重试。");
    } finally {
        setPendingPDF(null);
        setIsUploading(false);
        setUploadProgress(0);
    }
  };

  const removeAttachment = () => setAttachment(null);
  const loadExample = () => { setInputText(EXAMPLE_TEXT); setAttachment(null); textareaRef.current?.focus(); };
  const clearInput = () => { setInputText(''); setUserPrompt(''); setAttachment(null); setResult(null); setLoadingState('idle'); setError(null); setSelection(null); };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return <FileType className="w-8 h-8 text-red-500" />;
    if (mimeType.includes('image')) return <FileImage className="w-8 h-8 text-purple-500" />;
    return <FileText className="w-8 h-8 text-blue-500" />;
  };

  const isBusy = loadingState === 'loading' || loadingState === 'streaming' || isUploading;

  const getButtonText = () => {
    if (loadingState === 'streaming') return '正在生成结果...';
    if (loadingState === 'loading') {
       if (mode === 'professional') return '深度扫描中...';
       if (mode === 'sensitive') return '合规扫描中...';
       if (mode === 'official') return '公文审校中...';
       if (mode === 'polishing') return '智能润色中...';
       if (mode === 'format') return '格式分析中...';
       if (mode === 'file_scan') return '原文件分析中...';
       return '正在智能校对...';
    }
    if (mode === 'professional') return '开始专业深度校对';
    if (mode === 'sensitive') return '开始合规专项检查';
    if (mode === 'official') return '开始公文规范审校';
    if (mode === 'polishing') return '开始智能润色改写';
    if (mode === 'format') return '开始格式排版分析';
    if (mode === 'file_scan') return '开始原文件检测';
    return '开始校对';
  };

  const getButtonGradient = () => {
      if ((!inputText.trim() && !attachment) || isBusy) return 'bg-slate-300 cursor-not-allowed shadow-none';
      if (mode === 'professional') return 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400';
      if (mode === 'sensitive') return 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400';
      if (mode === 'official') return 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400';
      if (mode === 'polishing') return 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400';
      if (mode === 'format') return 'bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500';
      if (mode === 'file_scan') return 'bg-gradient-to-r from-cyan-700 to-cyan-600 hover:from-cyan-600 hover:to-cyan-500';
      return 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400';
  };

  const charCount = inputText.length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-brand-600 p-2 rounded-lg">
              <BookOpenCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-700 to-brand-500">
              GrammarZen
            </h1>
            <span className="hidden sm:inline-block text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 ml-2">
              中文智能校对
            </span>
          </div>
          <div className="flex items-center gap-2">
             <button
                onClick={() => setShowHelpModal(true)}
                className="text-xs text-slate-500 hover:text-brand-600 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-slate-50 border border-transparent hover:border-slate-200"
            >
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">帮助</span>
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button
                onClick={() => setShowRuleManager(true)}
                className="text-xs text-slate-600 hover:text-brand-600 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-slate-50 border border-transparent hover:border-slate-200"
            >
                <Book className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">规则库</span>
            </button>
            
            {user && (
                <button 
                    onClick={() => setShowHistoryModal(true)} 
                    className="text-xs text-slate-600 hover:text-brand-600 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-slate-50 border border-transparent hover:border-slate-200"
                >
                    <History className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">历史</span>
                </button>
            )}

            <button 
                onClick={() => setShowSensitiveModal(true)} 
                className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-rose-50 border border-transparent hover:border-rose-100"
            >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">敏感词</span>
                <span className="bg-rose-100 text-rose-600 px-1.5 rounded-full text-[10px] ml-0.5">{sensitiveWords.length}</span>
            </button>
            <button 
                onClick={() => setShowWhitelistModal(true)} 
                className="text-xs text-slate-500 hover:text-brand-600 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-slate-50 border border-transparent hover:border-slate-200"
            >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">白名单</span>
                <span className="bg-slate-100 text-slate-600 px-1.5 rounded-full text-[10px] ml-0.5">{whitelist.length}</span>
            </button>
            
            <div className="w-px h-4 bg-slate-200 mx-1"></div>

            {user ? (
               <div className="flex items-center gap-2 ml-1">
                 <button 
                    onClick={() => setShowProfileModal(true)}
                    className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-slate-100 transition-colors group"
                    title="个人中心"
                 >
                    <div className="w-8 h-8 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center font-bold text-xs overflow-hidden border border-transparent group-hover:border-brand-200">
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            user.user_metadata?.nickname?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()
                        )}
                    </div>
                    <span className="text-xs font-medium text-slate-600 group-hover:text-brand-700 max-w-[80px] truncate hidden sm:block">
                        {user.user_metadata?.nickname || '用户'}
                    </span>
                 </button>
               </div>
            ) : (
                <button
                    onClick={() => setShowAuthModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-full text-xs font-medium hover:bg-slate-800 transition-all shadow-sm ml-1"
                >
                    <LogIn className="w-3.5 h-3.5" />
                    登录/注册
                </button>
            )}

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {loadingState === 'idle' && !result && (
          <div className="text-center max-w-2xl mx-auto mb-10 animate-fade-in-up">
            <h2 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              让你的文字更<span className="text-brand-600">专业</span>、更<span className="text-brand-600">流畅</span>
            </h2>
            <p className="text-slate-600 text-lg mb-8">
              支持 Google Gemini, DeepSeek, 讯飞星火等多模型，为您提供高精度校对。
            </p>
          </div>
        )}

        <div className={`transition-all duration-700 ease-in-out transform ${result ? 'mb-8 translate-y-0' : 'mb-0'}`}>
          <div className={`bg-white rounded-xl shadow-sm border overflow-hidden relative group focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500 transition-all ${isBusy ? 'border-brand-300 shadow-md ring-2 ring-brand-100' : 'border-slate-200'}`}>
            
            {isUploading && (
              <div className="absolute inset-0 z-30 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
                 <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mb-4 shadow-sm border border-brand-100">
                    {progressLabel === '上传' ? (
                       <Upload className="w-8 h-8 text-brand-600 animate-bounce" />
                    ) : (
                       <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                    )}
                 </div>
                 <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden mb-3 ring-1 ring-slate-200">
                    <div 
                        className="h-full bg-brand-500 transition-all duration-300 ease-out rounded-full shadow-[0_0_10px_rgba(14,165,233,0.4)]" 
                        style={{ width: `${uploadProgress}%` }}
                    />
                 </div>
                 <p className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    正在{progressLabel}
                    <span className="text-brand-600 font-bold ml-1">{uploadProgress}%</span>
                 </p>
              </div>
            )}

            {loadingState === 'loading' && (
              <div className="absolute inset-0 pointer-events-none z-10 rounded-xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-brand-500 to-transparent shadow-[0_0_15px_rgba(14,165,233,0.6)] animate-scan opacity-80"></div>
                <div className="absolute inset-0 bg-brand-50/10 backdrop-blur-[0.5px] transition-all duration-500"></div>
              </div>
            )}

            {attachment && (
              <div className="mx-5 mt-5 mb-2 bg-slate-50 border border-slate-200 rounded-lg animate-fade-in flex flex-col">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getFileIcon(attachment.mimeType)}
                    <div>
                      <p className="text-sm font-medium text-slate-700 truncate max-w-[200px] sm:max-w-md">{attachment.name}</p>
                      <p className="text-xs text-slate-500">{(attachment.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button 
                    onClick={removeAttachment}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    disabled={isBusy}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {attachment.visualData && attachment.visualData.length > 0 && (
                   <div className="px-3 pb-3 overflow-x-auto custom-scrollbar">
                      <div className="flex gap-3">
                        {attachment.visualData.map((data, idx) => {
                           const srcPrefix = attachment.mimeType === 'application/pdf' ? 'data:image/jpeg;base64,' : `data:${attachment.mimeType};base64,`;
                           return (
                           <div key={idx} className="relative shrink-0 border border-slate-200 rounded-md overflow-hidden shadow-sm group">
                              <img src={`${srcPrefix}${data}`} alt={`Page ${idx + 1}`} className="h-24 w-auto object-contain bg-white"/>
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm backdrop-blur-[1px]">
                                {attachment.mimeType === 'application/pdf' ? `P${idx + 1}` : '预览'}
                              </span>
                           </div>
                           );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5 px-0.5">
                         <Check className="w-3 h-3 text-green-500" />
                         已提取 {attachment.visualData.length} 页内容用于多模态分析
                      </p>
                   </div>
                )}
              </div>
            )}
            
            <div className="relative w-full">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onMouseUp={handleMouseUp}
                  disabled={isBusy}
                  placeholder={attachment ? "（可选）输入对该文档的校对说明..." : "请输入或粘贴需要校对的中文文本..."}
                  className={`w-full p-5 text-base sm:text-lg leading-relaxed resize-none outline-none text-slate-900 placeholder:text-slate-400 bg-transparent relative z-0 ${attachment ? 'h-32' : 'h-48 sm:h-64'} ${isBusy ? 'opacity-70' : ''} transition-opacity duration-300`}
                  spellCheck={false}
                />
                
                {/* Floating Polish Button */}
                {selection && (
                    <div 
                        className="absolute z-20 animate-fade-in polishing-trigger"
                        style={{ 
                            top: Math.max(0, selection.top), 
                            left: Math.min(selection.left, (textareaRef.current?.offsetWidth || 500) - 100) 
                        }}
                    >
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setShowPolishingModal(true)}
                            className="flex items-center gap-1.5 bg-teal-600 text-white px-3 py-1.5 rounded-full shadow-lg hover:bg-teal-700 transition-transform hover:scale-105 active:scale-95 text-sm font-medium border border-teal-500/50"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            AI 润色此段
                        </button>
                    </div>
                )}
            </div>
            
            <div className={`bg-slate-50 px-4 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-y-2 relative z-20 ${isBusy ? 'opacity-80 pointer-events-none' : ''}`}>
               <div className="flex items-center gap-2">
                 <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.txt,.rtf" className="hidden" disabled={isBusy} />
                 <button
                   onClick={() => fileInputRef.current?.click()}
                   className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-brand-600 hover:bg-white bg-transparent rounded-lg transition-colors border border-transparent hover:border-slate-200 hover:shadow-sm"
                   title="上传 PDF, Word, TXT, RTF, 图片"
                   disabled={isBusy}
                 >
                   <Upload className="w-4 h-4" />
                   上传文档
                 </button>

                  <div className="h-4 w-px bg-slate-200 mx-1"></div>

                  <div className="relative group flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-slate-400 group-hover:text-brand-500 transition-colors" />
                      <div className="relative">
                          <select
                              value={modelName}
                              onChange={(e) => setModelName(e.target.value)}
                              className="appearance-none bg-transparent text-sm font-medium text-slate-600 hover:text-brand-600 cursor-pointer pr-6 focus:outline-none transition-colors max-w-[180px]"
                              disabled={isBusy}
                          >
                              <optgroup label="Google Gemini">
                                <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                                <option value="gemini-3-pro-preview">Gemini 3.0 Pro</option>
                              </optgroup>
                              <optgroup label="DeepSeek (需配置 Key)">
                                <option value="deepseek-chat">DeepSeek V3 (Chat)</option>
                                <option value="deepseek-reasoner">DeepSeek R1 (Reasoner)</option>
                              </optgroup>
                              <optgroup label="科大讯飞星火 (需配置 Key)">
                                <option value="spark-ultra">星火 Spark 4.0 Ultra</option>
                                <option value="spark-max">星火 Spark Max (V3.5)</option>
                                <option value="spark-pro">星火 Spark Pro (V3.0)</option>
                                <option value="spark-lite">星火 Spark Lite</option>
                              </optgroup>
                              <optgroup label="Moonshot Kimi (需配置 Key)">
                                <option value="moonshot-v1-8k">Kimi moonshot-v1-8k</option>
                                <option value="moonshot-v1-32k">Kimi moonshot-v1-32k</option>
                                <option value="moonshot-v1-128k">Kimi moonshot-v1-128k</option>
                              </optgroup>
                          </select>
                          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                  </div>
                 
                 {(!inputText && !attachment) && (
                   <button
                     onClick={loadExample}
                     className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-full hover:bg-brand-50 transition-colors ml-2"
                     disabled={isBusy}
                   >
                     试一试示例
                   </button>
                 )}
               </div>

               <div className="flex items-center gap-4">
                  <div className="text-xs font-medium text-slate-400 font-mono hidden sm:block">
                     {charCount} 字
                  </div>

                  <div className="flex items-center flex-wrap bg-white border border-slate-200 rounded-lg p-0.5">
                    <button onClick={() => setMode('fast')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'fast' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Zap className="w-3 h-3" />快速</button>
                    <button onClick={() => setMode('professional')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'professional' ? 'bg-purple-100 text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Sparkles className="w-3 h-3" />深度</button>
                    <button onClick={() => setMode('format')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'format' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="推荐上传PDF/图片"><LayoutTemplate className="w-3 h-3" />格式</button>
                    <button onClick={() => setMode('file_scan')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'file_scan' ? 'bg-cyan-100 text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="上传文件直接检测，不提取文字"><FileSearch className="w-3 h-3" />原文件</button>
                    <button onClick={() => setMode('official')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'official' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><FileBadge className="w-3 h-3" />公文</button>
                    <button onClick={() => setMode('sensitive')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'sensitive' ? 'bg-rose-100 text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><ShieldAlert className="w-3 h-3" />合规</button>
                    <button onClick={() => setMode('polishing')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'polishing' ? 'bg-teal-100 text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><PenTool className="w-3 h-3" />润色</button>
                  </div>

                  {(inputText.length > 0 || attachment) && (
                    <button onClick={clearInput} className="text-slate-400 hover:text-red-500 text-sm flex items-center gap-1 transition-colors" disabled={isBusy}><Eraser className="w-4 h-4" />清空</button>
                  )}
               </div>
            </div>
            
            {/* Tone Selector for Polishing Mode */}
            {mode === 'polishing' && (
              <div className="px-4 py-2 bg-teal-50 border-t border-teal-100 flex items-center gap-3 animate-fade-in">
                  <span className="text-xs font-medium text-teal-700 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      润色风格:
                  </span>
                  <div className="flex gap-2">
                      {[
                          { id: 'general', label: '通用', icon: null },
                          { id: 'academic', label: '学术', icon: GraduationCap },
                          { id: 'business', label: '商务', icon: Briefcase },
                          { id: 'creative', label: '创意', icon: Palette },
                          { id: 'casual', label: '口语', icon: Coffee }
                      ].map(tone => {
                          const Icon = tone.icon;
                          const isSelected = polishingTone === tone.id;
                          return (
                              <button
                                  key={tone.id}
                                  onClick={() => setPolishingTone(tone.id)}
                                  disabled={isBusy}
                                  className={`
                                      flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all border
                                      ${isSelected 
                                          ? 'bg-white text-teal-700 border-teal-300 shadow-sm' 
                                          : 'bg-transparent text-teal-600/70 border-transparent hover:bg-teal-100/50 hover:text-teal-800'
                                      }
                                  `}
                              >
                                  {Icon && <Icon className="w-3 h-3" />}
                                  {tone.label}
                              </button>
                          )
                      })}
                  </div>
              </div>
            )}
          </div>

          {ruleLibraries.length > 0 && (
             <div className="mt-3 flex flex-wrap gap-2 items-center animate-fade-in px-1">
                 <span className="text-xs font-medium text-slate-500 mr-1 flex items-center gap-1"><Book className="w-3 h-3" />应用规则:</span>
                 {ruleLibraries.map(lib => (
                     <button key={lib.id} onClick={() => toggleLibrarySelection(lib.id)} disabled={isBusy} className={`text-xs px-2.5 py-1 rounded border transition-all ${selectedLibIds.has(lib.id) ? 'bg-brand-50 border-brand-200 text-brand-700 font-medium' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>{lib.name}</button>
                 ))}
             </div>
          )}

          <div className="mt-3 px-1 animate-fade-in">
             <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><MessageSquarePlus className="h-4 w-4 text-slate-400" /></div>
                <input type="text" value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} disabled={isBusy} className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-shadow shadow-sm" placeholder="（可选）输入本次校对的特殊指令，例如：‘语气更正式一点’、‘检查人名是否正确’..." />
             </div>
          </div>

          <div className="mt-4 flex justify-center sm:justify-end">
            <button
              onClick={handleCheck}
              disabled={(!inputText.trim() && !attachment) || isBusy}
              className={`flex items-center gap-2 px-8 py-3 rounded-full text-white font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all ${getButtonGradient()}`}
            >
              {(loadingState === 'loading' || loadingState === 'streaming') ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{getButtonText()}</span>
                </>
              ) : (
                <>
                  {mode === 'sensitive' ? <ShieldAlert className="w-5 h-5"/> : (mode === 'official' ? <FileBadge className="w-5 h-5"/> : (mode === 'format' ? <LayoutTemplate className="w-5 h-5" /> : (mode === 'file_scan' ? <FileSearch className="w-5 h-5" /> : (mode === 'polishing' ? <PenTool className="w-5 h-5" /> : <Wand2 className="w-5 h-5" />))))}
                  <span>{getButtonText()}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {loadingState === 'error' && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 text-red-700 animate-fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {(loadingState === 'success' || loadingState === 'streaming') && result && (
           <div className="mt-8 animate-fade-in-up">
             <ResultView result={result} originalText={inputText} onAddToWhitelist={handleAddToWhitelist} attachment={attachment} />
           </div>
        )}

      </main>

      <footer className="mt-auto py-6 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} GrammarZen. Powered by Google Gemini. 创意设计 dgjin</p>
      </footer>

      {/* Modals */}
      <PolishingModal 
         isOpen={showPolishingModal} 
         onClose={() => setShowPolishingModal(false)}
         selectedText={selection?.text || ''}
         modelName={modelName}
         initialTone={polishingTone}
         onReplace={handleReplaceSelection}
      />
      
      <PDFProcessModal isOpen={showPDFModal} onClose={() => { setShowPDFModal(false); setPendingPDF(null); }} fileName={pendingPDF?.file.name || ''} totalPages={pdfPageCount} pdfDocument={pendingPDF?.doc} onConfirm={handlePDFProcessConfirm} />

      {showWhitelistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full m-4 overflow-hidden animate-fade-in-up border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brand-600" />白名单管理</h3>
              <button onClick={() => setShowWhitelistModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {whitelist.length === 0 ? (
                <div className="text-center text-slate-500 py-10 flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300"><ShieldCheck className="w-8 h-8" /></div>
                  <p className="font-medium text-slate-700">白名单是空的</p>
                  <p className="text-sm mt-1 text-slate-400 max-w-xs">在校对结果中，点击“忽略并加入白名单”按钮，该词汇就会出现在这里。</p>
                </div>
              ) : (
                <>
                    <p className="text-sm text-slate-500 mb-4">以下词汇在校对时将被自动忽略：</p>
                    <div className="flex flex-wrap gap-2 max-h-[50vh] overflow-y-auto content-start">
                    {whitelist.map((word, index) => (
                        <div key={index} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-sm border border-slate-200 group hover:border-red-200 hover:bg-red-50 transition-all duration-200">
                        <span className="font-medium">{word}</span>
                        <button onClick={() => handleRemoveFromWhitelist(word)} className="text-slate-300 group-hover:text-red-500 transition-colors ml-1 p-0.5 rounded-full hover:bg-red-100" title="移除"><X className="w-3 h-3" /></button>
                        </div>
                    ))}
                    </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div>{whitelist.length > 0 && (<span className="text-xs text-slate-400">共 {whitelist.length} 个词汇</span>)}</div>
              <div className="flex gap-3">
                {whitelist.length > 0 && (
                    <button onClick={clearWhitelist} className="flex items-center gap-1.5 px-4 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-red-100"><Trash2 className="w-4 h-4" />清空所有</button>
                )}
                <button onClick={() => setShowWhitelistModal(false)} className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-all shadow-sm">完成</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SensitiveWordsModal isOpen={showSensitiveModal} onClose={() => setShowSensitiveModal(false)} words={sensitiveWords} onAdd={handleAddSensitiveWord} onRemove={handleRemoveSensitiveWord} onClear={clearSensitiveWords} onBatchAdd={handleBatchAddSensitiveWords} />
      <RuleManagerModal isOpen={showRuleManager} onClose={() => setShowRuleManager(false)} libraries={ruleLibraries} onAddLibrary={handleAddLibrary} onDeleteLibrary={handleDeleteLibrary} />
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      
      {/* Auth & Profile Modals */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />
      <UserProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={user} onLogout={handleLogout} />
      {user && <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} userId={user.id} onLoadRecord={handleLoadHistoryRecord} />}
    </div>
  );
}