import React, { useState, useRef, useEffect } from 'react';
import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { checkChineseText, Part, CheckMode, IndustryType, generateFileSummary, FileSummary } from './services/geminiService';
import { ProofreadResult, LoadingState, RuleLibrary, HistoryRecord, Recommendation, CollaborationSession } from './types';
import { ResultView } from './components/ResultView';
import { RuleManagerModal } from './components/RuleManagerModal';
import { SensitiveWordsModal } from './components/SensitiveWordsModal';
import { PDFProcessModal } from './components/PDFProcessModal';
import { HelpModal } from './components/HelpModal';
import { AuthModal } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { PolishingModal } from './components/PolishingModal';
import { HistoryModal } from './components/HistoryModal';
import { processLargeFile } from './utils/fileUtils';
import { getRecommendations, getHistoryStats } from './services/recommendationService';
import { 
  createCollaborationSession, 
  getCollaborationSessions, 
  updateCollaborationDocument,
  addCollaborationParticipant
} from './services/collaborationService';
import { 
  Wand2, Eraser, AlertCircle, BookOpenCheck, Upload, FileText, X, FileImage, 
  FileType, Sparkles, Zap, ShieldCheck, Trash2, Book, ShieldAlert, Cpu, 
  ChevronDown, FileBadge, PenTool, LayoutTemplate, Check, Loader2, FileSearch, 
  HelpCircle, MessageSquarePlus, LogIn, GraduationCap, Briefcase, Palette, Coffee, Layers, History,
  Users, Share2, Lightbulb, BarChart2, CheckCheck
} from 'lucide-react';
import { supabase, loadUserConfig, loadRuleLibraries, saveWhitelist, saveSensitiveWords, addRuleLibrary, deleteRuleLibrary, saveHistoryRecord, loadHistory, loadUserApiKeys, UserApiKeys } from './services/supabaseService';

// Configure PDF.js worker
GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

const EXAMPLE_TEXT = `作者：小飞飞，撰写于6月31日。 
  想当年，他所带领的军队以锐不可挡之势，横扫大江南北，可以说是在父兄基业上既往开来，成就了一番伟业。原本偏安一隅的小国，从他的手中变成了十三个州，国人对这位领袖的敬意由然而生。威望的增加、权利的扩张丝毫没有改变他原有的样样子，他迈步走进岳楼，回忆起在湖北省张家界市的一段往事。那是一个薄雾蒙蒙的清晨，在急促行军途中他与一位素未谋面的人相逢，虽然之后并没有太多故事，却至今难以忘却，正当他的思绪陷入过往，忽然一阵震天的马蹄声夹杂着士兵的喧闹传来，报："敌人来袭，我方战线危机，望将军火速驰援"。由于刚刚陷入过往的原因，他稍微愣了愣神，咆哮道："大军听令，即刻出发"！军令如山。成群的士兵迅速从营房中跑出在校场上整齐队列，方阵如虹、战马昂首、刀枪如林、战旗迎风飘扬，将士身上的盔甲在阳光照射下，闪耀着金属的光泽。看着这支曾跟着他南征北战的队伍，他默默翻身登上战马，走在队伍最前面。营房外的道路两旁站满了欢送的百姓，大家希望将军能带领着军队，再次创造奇迹。`;

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
  const [industry, setIndustry] = useState<IndustryType>('general');
  
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
  const [userApiKeys, setUserApiKeys] = useState<UserApiKeys>({});
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
  
  // Smart Recommendation State
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  
  // Collaboration State
  const [collaborationSessions, setCollaborationSessions] = useState<CollaborationSession[]>([]);
  const [showCollaborationModal, setShowCollaborationModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  
  // Help Modal State
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Partial Polishing State
  const [selection, setSelection] = useState<{ text: string, top: number, left: number, start: number, end: number } | null>(null);
  const [showPolishingModal, setShowPolishingModal] = useState(false);
  
  // Summary State
  const [summary, setSummary] = useState<FileSummary | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryPrompt, setSummaryPrompt] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
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

        // Load user API keys (decrypted) for Gemini etc.
        if (user) {
          const keys = await loadUserApiKeys(user.id);
          setUserApiKeys(keys);
        } else {
          setUserApiKeys({});
        }

        // Load Rules
        const rules = await loadRuleLibraries(user?.id);
        setRuleLibraries(rules);

        // Load History Records for recommendations
        if (user) {
          const records = await loadHistory(user.id);
          setHistoryRecords(records);
        }
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

  // Update recommendations when input text changes
  useEffect(() => {
    const updateRecommendations = async () => {
      if (inputText.length > 0) {
        const recs = getRecommendations(inputText, historyRecords);
        setRecommendations(recs);
      } else {
        setRecommendations([]);
      }
    };

    // Debounce to avoid frequent updates
    const timeoutId = setTimeout(updateRecommendations, 500);
    return () => clearTimeout(timeoutId);
  }, [inputText, historyRecords]);

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

  // Collaboration Functions
  const handleCreateCollaborationSession = async () => {
    if (!user || !newSessionName.trim()) return;
    
    const session = createCollaborationSession(newSessionName, user.id, inputText);
    setCollaborationSessions(prev => [...prev, session]);
    setNewSessionName('');
    setShowCollaborationModal(false);
  };

  const loadCollaborationSessions = async () => {
    if (!user) return;
    const sessions = getCollaborationSessions(user.id);
    setCollaborationSessions(sessions);
  };

  const handleJoinCollaborationSession = async (sessionId: string) => {
    if (!user) return;
    const session = addCollaborationParticipant(sessionId, user.id);
    if (session) {
      setCollaborationSessions(prev => prev.map(s => s.id === sessionId ? session : s));
    }
  };

  const handleUpdateCollaborationDocument = async (sessionId: string, newText: string, issues: any[]) => {
    if (!user) return;
    const session = updateCollaborationDocument(sessionId, user.id, newText, issues);
    if (session) {
      setCollaborationSessions(prev => prev.map(s => s.id === sessionId ? session : s));
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
        industry, // Pass the industry template
        (partialResult) => {
           setLoadingState('streaming');
           setResult(partialResult);
        },
        userApiKeys
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

  // Summary Function
  const handleGenerateSummary = async () => {
    if (!inputText.trim() && !attachment) return;

    setIsGeneratingSummary(true);
    setSummaryError(null);

    try {
      let content: string | Part[];

      // Decide what to send based on attachment
      if (attachment && attachment.data) {
        const textOnlyMimes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/rtf', 'application/rtf'];
        if (textOnlyMimes.includes(attachment.mimeType)) {
             content = inputText || "请分析这份文件内容并生成摘要。";
        } else {
             content = [
               { text: inputText || "请分析这份文件内容并生成摘要。" },
               { inlineData: { mimeType: attachment.mimeType, data: attachment.data } }
             ];
        }
      } else {
        content = inputText;
      }

      const data = await generateFileSummary(
        content,
        summaryPrompt,
        modelName,
        userApiKeys
      );
      setSummary(data);
      setShowSummaryModal(true);
    } catch (err: any) {
      console.error(err);
      setSummaryError(`生成摘要失败: ${err.message || '服务暂时不可用'}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    if (file.size > 15 * 1024 * 1024) { 
      setError("文件大小不能超过 15MB。");
      return;
    }

    setError(null);
    setLoadingState('idle');
    setIsUploading(true);
    setUploadProgress(0);
    setProgressLabel('上传');

    try {
      // 使用分块处理大文件
      const base64Data = await processLargeFile(file, (progress) => {
        setUploadProgress(progress);
      });

      setProgressLabel('处理');

      if (file.type === 'application/pdf') {
        if (mode === 'file_scan') {
          setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size, visualData: [] });
          setInputText("");
        } else {
          const arrayBuffer = base64ToArrayBuffer(base64Data);
          const loadingTask = getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          setPendingPDF({ file, doc: pdf, base64: base64Data });
          setPdfPageCount(pdf.numPages);
          setShowPDFModal(true);
        }
      } 
      else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        const mammothResult = await mammoth.extractRawText({ arrayBuffer });
        setInputText(mammothResult.value);
        setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size });
        if (textareaRef.current) textareaRef.current.focus();
      } 
      else if (file.type === 'text/plain') {
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        const textDecoder = new TextDecoder('utf-8');
        const text = textDecoder.decode(arrayBuffer);
        setInputText(text);
        setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size });
        if (textareaRef.current) textareaRef.current.focus();
      }
      else if (file.type === 'application/rtf' || file.type === 'text/rtf' || file.name.endsWith('.rtf')) {
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        const textDecoder = new TextDecoder('utf-8');
        const rtfContent = textDecoder.decode(arrayBuffer);
        const text = parseRTF(rtfContent);
        setInputText(text);
        setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size });
        if (textareaRef.current) textareaRef.current.focus();
      }
      else {
        // Image files
        setAttachment({ name: file.name, mimeType: file.type, data: base64Data, size: file.size, visualData: [base64Data] });
      }
    } catch (err) {
      console.error("File processing error:", err);
      setError(`文件处理失败: ${(err as Error).message || '未知错误'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

        // Process pages in chunks to avoid UI blocking
        const chunkSize = 3;
        for (let i = 0; i < pages.length; i += chunkSize) {
            const chunk = pages.slice(i, i + chunkSize);
            
            for (const pageNum of chunk) {
                const page = await doc.getPage(pageNum);
                
                // Extract text
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                extractedText += pageText + "\n\n";

                // Generate visual preview (optional)
                try {
                    const viewport = page.getViewport({ scale: scale });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    if (context) {
                        canvas.height = Math.min(viewport.height, 1080); // Limit height to avoid memory issues
                        canvas.width = Math.min(viewport.width, 1920); // Limit width to avoid memory issues
                        const scaledViewport = page.getViewport({ scale: Math.min(scale, 1.0) });
                        
                        await page.render({ 
                            canvasContext: context, 
                            viewport: scaledViewport 
                        } as any).promise;
                        
                        visualImages.push(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
                    }
                } catch (visualErr) {
                    console.warn(`Failed to render PDF page ${pageNum} to image`, visualErr);
                }
            }
            
            // Update progress after each chunk
            const processedPages = Math.min(i + chunkSize, pages.length);
            setUploadProgress(Math.round((processedPages / pages.length) * 100));
            
            // Add a small delay to allow UI to update
            await new Promise(resolve => setTimeout(resolve, 100));
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
        setError(`PDF 处理过程中发生错误: ${(e as Error).message || '未知错误'}`);
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
      return 'bg-gradient-to-r from-[#0D9488] to-[#14B8A6] hover:from-[#14B8A6] hover:to-[#0F766E]';
  };

  const charCount = inputText.length;

  return (
    <div className="min-h-screen bg-[#F0FDFA] text-[#0F172A] flex flex-col font-sans">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
      {/* Header */}
      <header className="bg-white border-b border-teal-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#0D9488] p-2 rounded-lg shadow-md transition-all hover:shadow-lg">
              <BookOpenCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#0D9488] to-[#14B8A6]">
              GrammarZen
            </h1>
            <span className="hidden sm:inline-block text-xs bg-teal-50 text-[#0F172A] px-2 py-0.5 rounded-full border border-teal-100 ml-2">
                中文智能校对
            </span>
          </div>
          <div className="flex items-center gap-2">
             <button
                onClick={() => setShowHelpModal(true)}
                className="text-xs text-slate-600 hover:text-[#0D9488] flex items-center gap-1 transition-colors duration-200 px-3 py-1.5 rounded-full hover:bg-teal-50 border border-transparent hover:border-teal-100"
            >
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">帮助</span>
            </button>
            <div className="w-px h-4 bg-teal-100 mx-1"></div>
            <button
                onClick={() => setShowRuleManager(true)}
                className="text-xs text-slate-600 hover:text-[#0D9488] flex items-center gap-1 transition-colors duration-200 px-3 py-1.5 rounded-full hover:bg-teal-50 border border-transparent hover:border-teal-100"
            >
                <Book className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">规则库</span>
            </button>
            
            {user && (
                <button 
                    onClick={() => setShowHistoryModal(true)} 
                    className="text-xs text-slate-600 hover:text-[#0D9488] flex items-center gap-1 transition-colors duration-200 px-3 py-1.5 rounded-full hover:bg-teal-50 border border-transparent hover:border-teal-100"
                >
                    <History className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">历史</span>
                </button>
            )}

            <button 
                onClick={() => setShowSensitiveModal(true)} 
                className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors duration-200 px-3 py-1.5 rounded-full hover:bg-rose-50 border border-transparent hover:border-rose-100"
            >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">敏感词</span>
                <span className="bg-rose-100 text-rose-600 px-1.5 rounded-full text-[10px] ml-0.5">{sensitiveWords.length}</span>
            </button>
            <button 
                onClick={() => setShowWhitelistModal(true)} 
                className="text-xs text-slate-600 hover:text-[#0D9488] flex items-center gap-1 transition-colors duration-200 px-3 py-1.5 rounded-full hover:bg-teal-50 border border-transparent hover:border-teal-100"
            >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">白名单</span>
                <span className="bg-teal-100 text-[#0D9488] px-1.5 rounded-full text-[10px] ml-0.5">{whitelist.length}</span>
            </button>
            
            <div className="w-px h-4 bg-teal-100 mx-1"></div>

            {user ? (
               <div className="flex items-center gap-2 ml-1">
                 <button 
                    onClick={() => setShowProfileModal(true)}
                    className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-teal-50 transition-colors duration-200 group cursor-pointer"
                    title="个人中心"
                 >
                    <div className="w-8 h-8 bg-teal-100 text-[#0D9488] rounded-full flex items-center justify-center font-bold text-xs overflow-hidden border border-transparent group-hover:border-teal-200 transition-all duration-200">
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} alt={`${user.user_metadata?.nickname || '用户'} 的头像`} className="w-full h-full object-cover" />
                        ) : (
                            user.user_metadata?.nickname?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()
                        )}
                    </div>
                    <span className="text-xs font-medium text-slate-700 group-hover:text-[#0D9488] max-w-[80px] truncate hidden sm:block">
                        {user.user_metadata?.nickname || '用户'}
                    </span>
                 </button>
               </div>
            ) : (
                <button
                    onClick={() => setShowAuthModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F97316] text-white rounded-full text-xs font-medium hover:bg-[#EA580C] transition-all duration-200 shadow-md hover:shadow-lg ml-1 cursor-pointer"
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
            <h2 className="text-3xl font-bold text-[#0F172A] mb-4 tracking-tight">
              让你的文字更<span className="text-[#0D9488]">专业</span>、更<span className="text-[#0D9488]">流畅</span>
            </h2>
            <p className="text-slate-600 text-lg mb-8">
              支持 Google Gemini, DeepSeek, 讯飞星火等多模型，为您提供高精度校对。
            </p>
          </div>
        )}

        <div className={`transition-all duration-700 ease-in-out transform ${result ? 'mb-8 translate-y-0' : 'mb-0'}`}>
          <div className={`bg-white rounded-xl shadow-md border overflow-hidden relative group focus-within:ring-2 focus-within:ring-[#0D9488]/20 focus-within:border-[#0D9488] transition-all ${isBusy ? 'border-[#14B8A6] shadow-lg ring-2 ring-[#14B8A6]/20' : 'border-teal-100'}`}>
            
            {isUploading && (
              <div className="absolute inset-0 z-30 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
                 <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-teal-100">
                    {progressLabel === '上传' ? (
                       <Upload className="w-8 h-8 text-[#0D9488] animate-bounce" />
                    ) : (
                       <Loader2 className="w-8 h-8 text-[#0D9488] animate-spin" />
                    )}
                 </div>
                 <div className="w-72 h-2 bg-teal-50 rounded-full overflow-hidden mb-4 ring-1 ring-teal-100">
                    <div 
                        className="h-full bg-[#0D9488] transition-all duration-300 ease-out rounded-full shadow-[0_0_10px_rgba(13,148,136,0.4)]" 
                        style={{ width: `${uploadProgress}%` }}
                    />
                 </div>
                 <p className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    正在{progressLabel}
                    <span className="text-[#0D9488] font-bold ml-1">{uploadProgress}%</span>
                 </p>
              </div>
            )}

            {loadingState === 'loading' && (
              <div className="absolute inset-0 pointer-events-none z-10 rounded-xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-[#0D9488] to-transparent shadow-[0_0_15px_rgba(13,148,136,0.6)] animate-scan opacity-80"></div>
                <div className="absolute inset-0 bg-teal-50/10 backdrop-blur-[0.5px] transition-all duration-500"></div>
              </div>
            )}

            {attachment && (
              <div className="mx-5 mt-5 mb-2 bg-teal-50 border border-teal-100 rounded-lg animate-fade-in flex flex-col">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getFileIcon(attachment.mimeType)}
                    <div>
                      <p className="text-sm font-medium text-[#0F172A] truncate max-w-[200px] sm:max-w-md">{attachment.name}</p>
                      <p className="text-xs text-slate-500">{(attachment.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button 
                    onClick={removeAttachment}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors duration-200"
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
                           <div key={idx} className="relative shrink-0 border border-teal-100 rounded-md overflow-hidden shadow-sm group transition-all duration-200 hover:shadow-md">
                              <img src={`${srcPrefix}${data}`} alt={`${attachment.name} 第 ${idx + 1} 页`} className="h-24 w-auto object-contain bg-white"/>
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm backdrop-blur-[1px]">
                                {attachment.mimeType === 'application/pdf' ? `P${idx + 1}` : '预览'}
                              </span>
                           </div>
                           );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5 px-0.5">
                         <Check className="w-3 h-3 text-[#0D9488]" />
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
                  className={`w-full p-6 text-base sm:text-lg leading-relaxed resize-none outline-none text-[#0F172A] placeholder:text-slate-400 bg-transparent relative z-0 ${attachment ? 'h-32' : 'h-48 sm:h-64'} ${isBusy ? 'opacity-70' : ''} transition-opacity duration-300`}
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
                            className="flex items-center gap-1.5 bg-[#0D9488] text-white px-3 py-1.5 rounded-full shadow-lg hover:bg-[#0F766E] transition-all duration-200 hover:scale-105 active:scale-95 text-sm font-medium border border-[#14B8A6]/50 cursor-pointer"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            AI 润色此段
                        </button>
                    </div>
                )}
            </div>
            
            <div className={`bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-y-3 relative z-20 ${isBusy ? 'opacity-80 pointer-events-none' : ''}`}>
               <div className="flex items-center gap-3">
                 <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.txt,.rtf" className="hidden" disabled={isBusy} />
                 <button
                   onClick={() => fileInputRef.current?.click()}
                   className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-[#0D9488] hover:bg-white bg-transparent rounded-lg transition-all duration-200 border border-transparent hover:border-slate-200 hover:shadow-sm cursor-pointer"
                   title="上传 PDF, Word, TXT, RTF, 图片"
                   disabled={isBusy}
                 >
                   <Upload className="w-4 h-4" />
                   上传文档
                 </button>

                  <div className="h-4 w-px bg-slate-200 mx-2"></div>

                  <div className="relative group flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-slate-400 group-hover:text-[#0D9488] transition-colors" />
                      <div className="relative">
                          <select
                              value={modelName}
                              onChange={(e) => setModelName(e.target.value)}
                              className="appearance-none bg-transparent text-sm font-medium text-slate-600 hover:text-[#0D9488] cursor-pointer pr-6 focus:outline-none transition-colors max-w-[180px]"
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
                              <optgroup label="Min-Max (需配置 Key)">
                                <option value="min-max">Min-Max 模型</option>
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

                  <div className="flex items-center flex-wrap bg-white border border-slate-200 rounded-lg p-1 gap-1">
                    <button onClick={() => setMode('fast')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${mode === 'fast' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Zap className="w-3 h-3" />快速</button>
                    <button onClick={() => setMode('professional')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${mode === 'professional' ? 'bg-purple-100 text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Sparkles className="w-3 h-3" />深度</button>
                    <button onClick={() => setMode('format')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${mode === 'format' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="推荐上传PDF/图片"><LayoutTemplate className="w-3 h-3" />格式</button>
                    <button onClick={() => setMode('file_scan')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${mode === 'file_scan' ? 'bg-cyan-100 text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="上传文件直接检测，不提取文字"><FileSearch className="w-3 h-3" />原文件</button>
                    <button onClick={() => setMode('official')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${mode === 'official' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><FileBadge className="w-3 h-3" />公文</button>
                    <button onClick={() => setMode('sensitive')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${mode === 'sensitive' ? 'bg-rose-100 text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><ShieldAlert className="w-3 h-3" />合规</button>
                    <button onClick={() => setMode('polishing')} disabled={isBusy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${mode === 'polishing' ? 'bg-teal-100 text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><PenTool className="w-3 h-3" />润色</button>
                  </div>

                  {(inputText.length > 0 || attachment) && (
                    <button onClick={clearInput} className="text-slate-400 hover:text-red-500 text-sm flex items-center gap-1 transition-all duration-200 cursor-pointer" disabled={isBusy}><Eraser className="w-4 h-4" />清空</button>
                  )}
               </div>
            </div>
            
            {/* Industry Template Selector */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-4 animate-fade-in">
                <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" />
                    行业模板:
                </span>
                <div className="flex gap-2">
                    {
                        [
                            { id: 'general', label: '通用' },
                            { id: 'academic', label: '学术' },
                            { id: 'technical', label: '技术' },
                            { id: 'social', label: '社交' },
                            { id: 'business', label: '商务' },
                            { id: 'legal', label: '法律' }
                        ].map(item => {
                            const isSelected = industry === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setIndustry(item.id as IndustryType)}
                                    disabled={isBusy}
                                    className={`
                            flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 border cursor-pointer
                            ${isSelected 
                                ? 'bg-white text-[#0D9488] border-[#14B8A6] shadow-sm' 
                                : 'bg-transparent text-slate-600/70 border-transparent hover:bg-slate-100/50 hover:text-slate-800'
                            }
                        `}
                                >
                                    {item.label}
                                </button>
                            )
                        })
                    }
                </div>
            </div>

            {/* Smart Recommendations */}
            {recommendations.length > 0 && (
              <div className="px-6 py-4 bg-indigo-50 border-t border-indigo-100 animate-fade-in">
                  <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-medium text-indigo-700">智能推荐</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {recommendations.map(rec => (
                          <div key={rec.id} className="bg-white border border-indigo-200 rounded-lg p-3 shadow-sm hover:shadow transition-shadow">
                              <h4 className="text-xs font-medium text-indigo-800 mb-1">{rec.title}</h4>
                              <p className="text-xs text-slate-600 mb-2">{rec.description}</p>
                              {rec.type === 'industry' && (
                                  <button
                                      onClick={() => setIndustry(rec.industry as IndustryType)}
                                      disabled={isBusy}
                                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                  >
                                      应用此模板
                                  </button>
                              )}
                              {rec.type === 'mode' && (
                                  <button
                                      onClick={() => setMode(rec.mode as CheckMode)}
                                      disabled={isBusy}
                                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                  >
                                      使用此模式
                                  </button>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
            )}

            {/* Collaboration Button */}
            {user && (
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-medium text-slate-600">协作功能</span>
                  </div>
                  <div className="flex gap-2">
                      <button
                          onClick={() => {
                            loadCollaborationSessions();
                            setShowCollaborationModal(true);
                          }}
                          disabled={isBusy}
                          className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-slate-600 hover:text-[#0D9488] hover:bg-white bg-transparent rounded-lg transition-all duration-200 border border-transparent hover:border-slate-200 hover:shadow-sm cursor-pointer"
                      >
                          <Share2 className="w-3.5 h-3.5" />
                          协作会话
                      </button>
                    </div>
              </div>
            )}
            
            {/* Tone Selector for Polishing Mode */}
            {mode === 'polishing' && (
              <div className="px-6 py-3 bg-teal-50 border-t border-teal-100 flex items-center gap-4 animate-fade-in">
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
                                      flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 border cursor-pointer
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
                     <button key={lib.id} onClick={() => toggleLibrarySelection(lib.id)} disabled={isBusy} className={`text-xs px-2.5 py-1 rounded border transition-all duration-200 cursor-pointer ${selectedLibIds.has(lib.id) ? 'bg-teal-50 border-[#14B8A6] text-[#0D9488] font-medium' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>{lib.name}</button>
                 ))}
             </div>
          )}

          <div className="mt-3 px-1 animate-fade-in">
             <div className="relative">
                <label htmlFor="userPrompt" className="sr-only">特殊指令</label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><MessageSquarePlus className="h-4 w-4 text-slate-400" /></div>
                <input id="userPrompt" type="text" value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} disabled={isBusy} className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0D9488] focus:border-[#0D9488] sm:text-sm transition-shadow shadow-sm" placeholder="（可选）输入本次校对的特殊指令，例如：‘语气更正式一点’、‘检查人名是否正确’..." />
             </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center sm:justify-end">
            {/* Summary Prompt Input */}
            <div className="w-full sm:w-64">
              <div className="relative">
                <label htmlFor="summaryPrompt" className="sr-only">摘要提示词</label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><MessageSquarePlus className="h-4 w-4 text-slate-400" /></div>
                <input 
                  id="summaryPrompt"
                  type="text" 
                  value={summaryPrompt} 
                  onChange={(e) => setSummaryPrompt(e.target.value)} 
                  disabled={isBusy || isGeneratingSummary} 
                  className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0D9488] focus:border-[#0D9488] sm:text-sm transition-shadow shadow-sm"
                  placeholder="（可选）摘要提示词，例如：‘重点总结技术方案’、‘提取关键信息’..."
                />
              </div>
            </div>
            
            {/* Summary Button */}
            <button
              onClick={handleGenerateSummary}
              disabled={(!inputText.trim() && !attachment) || isBusy || isGeneratingSummary}
              className="flex items-center gap-2 px-6 py-3 rounded-full text-slate-700 font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              {isGeneratingSummary ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                  <span>生成摘要中...</span>
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  <span>生成摘要</span>
                </>
              )}
            </button>
            
            {/* Check Button */}
            <button
              onClick={handleCheck}
              disabled={(!inputText.trim() && !attachment) || isBusy || isGeneratingSummary}
              className={`flex items-center gap-2 px-8 py-3 rounded-full text-white font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ${getButtonGradient()}`}
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
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 text-red-700 animate-fade-in shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {summaryError && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 text-red-700 animate-fade-in shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
            <p className="text-sm font-medium">{summaryError}</p>
          </div>
        )}

        {(loadingState === 'success' || loadingState === 'streaming') && result && (
           <div className="mt-8 animate-fade-in-up">
             <ResultView result={result} originalText={inputText} onAddToWhitelist={handleAddToWhitelist} attachment={attachment} />
           </div>
        )}

      </main>

      <footer className="mt-auto py-6 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} GrammarZen. Powered by dgjin</p>
      </footer>

      {/* Modals */}
      <PolishingModal 
         isOpen={showPolishingModal} 
         onClose={() => setShowPolishingModal(false)}
         selectedText={selection?.text || ''}
         modelName={modelName}
         initialTone={polishingTone}
         onReplace={handleReplaceSelection}
         userGeminiApiKey={userApiKeys?.gemini}
      />
      
      <PDFProcessModal isOpen={showPDFModal} onClose={() => { setShowPDFModal(false); setPendingPDF(null); }} fileName={pendingPDF?.file.name || ''} totalPages={pdfPageCount} pdfDocument={pendingPDF?.doc} onConfirm={handlePDFProcessConfirm} />

      {showWhitelistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full m-4 overflow-hidden animate-fade-in-up border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#0D9488]" />白名单管理</h3>
              <button onClick={() => setShowWhitelistModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all duration-200 cursor-pointer"><X className="w-5 h-5" /></button>
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
                        <button onClick={() => handleRemoveFromWhitelist(word)} className="text-slate-300 group-hover:text-red-500 transition-colors ml-1 p-0.5 rounded-full hover:bg-red-100 cursor-pointer" title="移除"><X className="w-3 h-3" /></button>
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
                    <button onClick={clearWhitelist} className="flex items-center gap-1.5 px-4 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg text-sm font-medium transition-all duration-200 border border-transparent hover:border-red-100 cursor-pointer"><Trash2 className="w-4 h-4" />清空所有</button>
                )}
                <button onClick={() => setShowWhitelistModal(false)} className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm cursor-pointer">完成</button>
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
      <UserProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={user} onLogout={handleLogout} onApiKeysSaved={user ? () => { loadUserApiKeys(user.id).then(setUserApiKeys); } : undefined} />
      {user && <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} userId={user.id} onLoadRecord={handleLoadHistoryRecord} />}
      
      {/* Summary Modal */}
      {showSummaryModal && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSummaryModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-fade-in-up border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#0D9488]" />
                文件摘要
              </h3>
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-all duration-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Summary Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-500">原文字数</p>
                  <p className="font-semibold text-slate-900">{summary.wordCount}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-500">处理时间</p>
                  <p className="font-semibold text-slate-900">{summary.processingTime}ms</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-500">关键要点</p>
                  <p className="font-semibold text-slate-900">{summary.keyPoints.length}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-500">主要主题</p>
                  <p className="font-semibold text-slate-900">{summary.mainTopics.length}</p>
                </div>
              </div>
              
              {/* Summary Text */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <BookOpenCheck className="w-4 h-4 text-[#0D9488]" />
                  详细摘要
                </h4>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 leading-relaxed">
                  {typeof summary.summary === 'string' ? summary.summary : String(summary.summary ?? '')}
                </div>
              </div>
              
              {/* Key Points */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-[#0D9488]" />
                  关键要点
                </h4>
                <ul className="space-y-2">
                  {summary.keyPoints.map((point, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-teal-50 text-[#0D9488] rounded-full flex items-center justify-center text-xs font-bold mt-0.5 border border-teal-100">
                        {index + 1}
                      </span>
                      <span className="text-slate-700">{typeof point === 'string' ? point : String(point ?? '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Main Topics */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#0D9488]" />
                  主要主题
                </h4>
                <div className="flex flex-wrap gap-2">
                  {summary.mainTopics.map((topic, index) => (
                    <span key={index} className="px-3 py-1.5 bg-teal-50 text-[#0D9488] rounded-full text-sm border border-teal-100">
                      {typeof topic === 'string' ? topic : String(topic ?? '')}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Conclusion */}
              {summary.conclusion && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-[#0D9488]" />
                    结论与建议
                  </h4>
                  <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 leading-relaxed">
                    {typeof summary.conclusion === 'string' ? summary.conclusion : String(summary.conclusion ?? '')}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collaboration Modal */}
      {showCollaborationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCollaborationModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-fade-in-up border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">协作会话</h3>
              <button 
                onClick={() => setShowCollaborationModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-all duration-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {/* Create New Session */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-slate-700 mb-3">创建新会话</h4>
                <div className="flex gap-3">
                  <label htmlFor="newSessionName" className="sr-only">会话名称</label>
                  <input
                    id="newSessionName"
                    type="text"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder="会话名称"
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0D9488] focus:border-[#0D9488]"
                  />
                  <button
                    onClick={handleCreateCollaborationSession}
                    disabled={!newSessionName.trim()}
                    className="px-4 py-2 bg-[#0D9488] text-white rounded-lg text-sm font-medium hover:bg-[#0F766E] transition-all duration-200 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
                  >
                    创建
                  </button>
                </div>
              </div>
              
              {/* Existing Sessions */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-3">我的会话</h4>
                {collaborationSessions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无协作会话</p>
                    <p className="text-xs mt-1">创建一个新会话开始协作</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {collaborationSessions.map(session => (
                      <div key={session.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all duration-200">
                        <div>
                          <h5 className="text-sm font-medium text-slate-900">{session.name}</h5>
                          <p className="text-xs text-slate-500">{session.participants.length} 参与者 • {new Date(session.createdAt).toLocaleString()}</p>
                        </div>
                        <button
                          onClick={() => {
                            setInputText(session.document.currentText);
                            setShowCollaborationModal(false);
                          }}
                          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-all duration-200 cursor-pointer"
                        >
                          打开
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}