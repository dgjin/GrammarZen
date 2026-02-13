import React, { useState, useRef, useEffect } from 'react';
import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { checkChineseText, Part, CheckMode } from './services/geminiService';
import { ProofreadResult, LoadingState, RuleLibrary } from './types';
import { ResultView } from './components/ResultView';
import { RuleManagerModal } from './components/RuleManagerModal';
import { Wand2, Eraser, AlertCircle, BookOpenCheck, Upload, FileText, X, FileImage, FileType, Sparkles, Zap, ShieldCheck, Trash2, Book, ShieldAlert, Plus, Ban, Library, Download, Cpu, ChevronDown } from 'lucide-react';

// Configure PDF.js worker
GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

const EXAMPLE_TEXT = "我们的产品质量非常优秀，深受客户们的喜爱。但是，在使用过程中，难免会出现一些小问题。比如，链接不稳定、界面卡顿等等。希望大家能够谅解。我们会竟快修复这些bug，保证给大家一个完美得体验。";
const WHITELIST_KEY = 'grammarzen_whitelist';
const SENSITIVE_WORDS_KEY = 'grammarzen_sensitive_words';
const RULE_LIBS_KEY = 'grammarzen_rule_libs';

// Built-in vocabularies available in public/Vocabulary
const BUILT_IN_VOCABULARIES = [
  { name: '广告法违规词库', path: '/Vocabulary/ad-laws.txt', description: '包含“第一”、“顶级”等极限词' },
  { name: '通用违禁词库', path: '/Vocabulary/general-sensitive.txt', description: '包含涉政、暴力等常规敏感词' }
];

interface Attachment {
  name: string;
  mimeType: string;
  data: string; // Base64
  size: number;
}

function App() {
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<CheckMode>('fast');
  const [modelName, setModelName] = useState('gemini-3-flash-preview');
  
  // File Upload State
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Whitelist State
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [showWhitelistModal, setShowWhitelistModal] = useState(false);

  // Sensitive Words State
  const [sensitiveWords, setSensitiveWords] = useState<string[]>([]);
  const [showSensitiveModal, setShowSensitiveModal] = useState(false);
  const [newSensitiveWord, setNewSensitiveWord] = useState('');
  const sensitiveFileInputRef = useRef<HTMLInputElement>(null);

  // Rule Library State
  const [ruleLibraries, setRuleLibraries] = useState<RuleLibrary[]>([]);
  const [selectedLibIds, setSelectedLibIds] = useState<Set<string>>(new Set());
  const [showRuleManager, setShowRuleManager] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persistence on mount
  useEffect(() => {
    // Load Whitelist
    const savedWhitelist = localStorage.getItem(WHITELIST_KEY);
    if (savedWhitelist) {
      try {
        setWhitelist(JSON.parse(savedWhitelist));
      } catch (e) {
        console.error("Failed to parse whitelist", e);
      }
    }

    // Load Sensitive Words
    const savedSensitive = localStorage.getItem(SENSITIVE_WORDS_KEY);
    if (savedSensitive) {
      try {
        setSensitiveWords(JSON.parse(savedSensitive));
      } catch (e) {
        console.error("Failed to parse sensitive words", e);
      }
    }

    // Load Rule Libraries
    const savedRules = localStorage.getItem(RULE_LIBS_KEY);
    if (savedRules) {
        try {
            setRuleLibraries(JSON.parse(savedRules));
        } catch (e) {
            console.error("Failed to parse rule libs", e);
        }
    }
  }, []);

  // --- Whitelist Logic ---
  const handleAddToWhitelist = (word: string) => {
    if (!whitelist.includes(word)) {
      const newWhitelist = [...whitelist, word];
      setWhitelist(newWhitelist);
      localStorage.setItem(WHITELIST_KEY, JSON.stringify(newWhitelist));
    }
  };

  const handleRemoveFromWhitelist = (word: string) => {
    const newWhitelist = whitelist.filter(w => w !== word);
    setWhitelist(newWhitelist);
    localStorage.setItem(WHITELIST_KEY, JSON.stringify(newWhitelist));
  };

  const clearWhitelist = () => {
      if(window.confirm("确定要清空所有白名单词汇吗？")) {
          setWhitelist([]);
          localStorage.removeItem(WHITELIST_KEY);
      }
  }

  // --- Sensitive Words Logic ---
  const handleAddSensitiveWord = () => {
    const word = newSensitiveWord.trim();
    if (word && !sensitiveWords.includes(word)) {
      const newList = [...sensitiveWords, word];
      setSensitiveWords(newList);
      localStorage.setItem(SENSITIVE_WORDS_KEY, JSON.stringify(newList));
      setNewSensitiveWord('');
    }
  };

  const handleRemoveSensitiveWord = (word: string) => {
    const newList = sensitiveWords.filter(w => w !== word);
    setSensitiveWords(newList);
    localStorage.setItem(SENSITIVE_WORDS_KEY, JSON.stringify(newList));
  };

  const clearSensitiveWords = () => {
    if(window.confirm("确定要清空所有敏感词吗？")) {
      setSensitiveWords([]);
      localStorage.removeItem(SENSITIVE_WORDS_KEY);
    }
  };

  const handleImportSensitiveWords = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      processSensitiveImport(text);
    };
    reader.readAsText(file);
    if (sensitiveFileInputRef.current) sensitiveFileInputRef.current.value = '';
  };

  const processSensitiveImport = (text: string) => {
    let newWords: string[] = [];
    try {
      // Try parsing as JSON first
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        newWords = json.filter(item => typeof item === 'string').map(s => s.trim());
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

    const uniqueNewWords = newWords.filter(word => !sensitiveWords.includes(word));
    const dedupedNewWords = [...new Set(uniqueNewWords)];
    
    if (dedupedNewWords.length === 0) {
      alert("词库中的词汇已全部存在。");
      return;
    }

    const updatedList = [...sensitiveWords, ...dedupedNewWords];
    setSensitiveWords(updatedList);
    localStorage.setItem(SENSITIVE_WORDS_KEY, JSON.stringify(updatedList));
    alert(`成功导入 ${dedupedNewWords.length} 个新敏感词。`);
  };

  const handleLoadSystemVocabulary = async (vocabPath: string) => {
    try {
      const response = await fetch(vocabPath);
      if (!response.ok) throw new Error("Load failed");
      const text = await response.text();
      processSensitiveImport(text);
    } catch (e) {
      console.error(e);
      alert("无法加载系统内置词库，请检查网络或 Vocabulary 目录配置。");
    }
  };

  // --- Rule Library Logic ---
  const handleAddLibrary = (library: RuleLibrary) => {
      const newLibs = [library, ...ruleLibraries];
      setRuleLibraries(newLibs);
      localStorage.setItem(RULE_LIBS_KEY, JSON.stringify(newLibs));
      // Auto-select the newly added library
      setSelectedLibIds(prev => new Set(prev).add(library.id));
  };

  const handleDeleteLibrary = (id: string) => {
      if(window.confirm("确定要删除这个规则库吗？")) {
          const newLibs = ruleLibraries.filter(l => l.id !== id);
          setRuleLibraries(newLibs);
          localStorage.setItem(RULE_LIBS_KEY, JSON.stringify(newLibs));
          setSelectedLibIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
          });
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


  // --- Check Logic ---
  const handleCheck = async () => {
    if (!inputText.trim() && !attachment) return;

    setLoadingState('loading');
    setError(null);
    setResult(null);

    try {
      let content: string | Part[];

      if (attachment) {
        // Multimodal Request
        content = [
          {
            text: inputText || "请校对这份文件内容。"
          },
          {
            inlineData: {
              mimeType: attachment.mimeType,
              data: attachment.data
            }
          }
        ];
      } else {
        // Text Only Request
        content = inputText;
      }

      // Gather active custom rules
      const activeRules = ruleLibraries
        .filter(lib => selectedLibIds.has(lib.id))
        .flatMap(lib => lib.rules);

      // Pass lists to service
      const data = await checkChineseText(
        content, 
        mode, 
        modelName,
        whitelist,
        sensitiveWords,
        activeRules,
        (partialResult) => {
           // On first update, switch to streaming state so ResultView appears
           setLoadingState('streaming');
           setResult(partialResult);
        }
      );
      setResult(data);
      setLoadingState('success');
    } catch (err: any) {
      console.error(err);
      setError(`校验失败: ${err.message || '服务暂时不可用'}`);
      setLoadingState('error');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("不支持的文件格式。请上传 PDF, Word (.docx) 或图片 (JPG, PNG, WEBP)。");
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setError("文件大小不能超过 10MB。");
      return;
    }

    setError(null);
    setLoadingState('idle');
    setIsUploading(true);
    setUploadProgress(0);

    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    };

    reader.onload = async (e) => {
      const result = e.target?.result;
      if (!result) {
         setIsUploading(false);
         return;
      }

      // Handle PDF
      if (file.type === 'application/pdf') {
        try {
            const arrayBuffer = result as ArrayBuffer;
            // Use getDocument from the named import
            const loadingTask = getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += pageText + "\n\n";
            }

            if (fullText.trim().length > 20) {
                 setInputText(fullText);
                 setAttachment(null);
                 if (textareaRef.current) textareaRef.current.focus();
            } else {
                 // Fallback to visual mode (scanned PDF)
                 const bytes = new Uint8Array(arrayBuffer);
                 let binary = '';
                 for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                 }
                 const base64Data = window.btoa(binary);

                 setAttachment({
                    name: file.name,
                    mimeType: file.type,
                    data: base64Data,
                    size: file.size
                  });
                  setError("未能提取文本（可能是扫描件），已切换为图片识别模式。");
            }
        } catch (err) {
            console.error("PDF Parsing Error", err);
            setError("PDF 解析失败，请重试或尝试转换为图片上传。");
        }
      } 
      // Handle Word
      else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        try {
          const arrayBuffer = result as ArrayBuffer;
          const mammothResult = await mammoth.extractRawText({ arrayBuffer });
          setInputText(mammothResult.value);
          setAttachment(null);
          if (textareaRef.current) textareaRef.current.focus();
        } catch (e) {
          console.error("Word extraction failed", e);
          setError("无法读取 Word 文档，请稍后重试或复制文字粘贴。");
        }
      } 
      // Handle Images
      else {
         const base64String = result as string;
         const base64Data = base64String.split(',')[1];
         
         setAttachment({
            name: file.name,
            mimeType: file.type,
            data: base64Data,
            size: file.size
          });
          // Do not clear inputText if user already typed something, or clear it? 
          // Usually images override text context or serve as context.
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

    // Determine how to read based on type
    if (file.type.includes('image')) {
        reader.readAsDataURL(file);
    } else {
        // Word and PDF use ArrayBuffer
        reader.readAsArrayBuffer(file);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
  };

  const loadExample = () => {
    setInputText(EXAMPLE_TEXT);
    setAttachment(null);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const clearInput = () => {
    setInputText('');
    setAttachment(null);
    setResult(null);
    setLoadingState('idle');
    setError(null);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return <FileType className="w-8 h-8 text-red-500" />;
    if (mimeType.includes('image')) return <FileImage className="w-8 h-8 text-purple-500" />;
    return <FileText className="w-8 h-8 text-blue-500" />;
  };

  const isBusy = loadingState === 'loading' || loadingState === 'streaming' || isUploading;

  // Determine button text based on mode
  const getButtonText = () => {
    if (loadingState === 'streaming') return '正在生成结果...';
    if (loadingState === 'loading') {
       if (mode === 'professional') return '深度扫描中...';
       if (mode === 'sensitive') return '合规扫描中...';
       return '正在智能校对...';
    }
    if (mode === 'professional') return '开始专业深度校对';
    if (mode === 'sensitive') return '开始合规专项检查';
    return '开始校对';
  };

  const getButtonGradient = () => {
      if ((!inputText.trim() && !attachment) || isBusy) return 'bg-slate-300 cursor-not-allowed shadow-none';
      if (mode === 'professional') return 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400';
      if (mode === 'sensitive') return 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400';
      return 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400';
  };

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
                onClick={() => setShowRuleManager(true)}
                className="text-xs text-slate-600 hover:text-brand-600 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-slate-50 border border-transparent hover:border-slate-200"
            >
                <Book className="w-3.5 h-3.5" />
                本地规则库
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button 
                onClick={() => setShowSensitiveModal(true)} 
                className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-rose-50 border border-transparent hover:border-rose-100"
            >
                <ShieldAlert className="w-3.5 h-3.5" />
                敏感词库 <span className="bg-rose-100 text-rose-600 px-1.5 rounded-full text-[10px] ml-0.5">{sensitiveWords.length}</span>
            </button>
            <button 
                onClick={() => setShowWhitelistModal(true)} 
                className="text-xs text-slate-500 hover:text-brand-600 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-slate-50 border border-transparent hover:border-slate-200"
            >
                <ShieldCheck className="w-3.5 h-3.5" />
                白名单 <span className="bg-slate-100 text-slate-600 px-1.5 rounded-full text-[10px] ml-0.5">{whitelist.length}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Intro / Empty State */}
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

        {/* Input Area */}
        <div className={`transition-all duration-700 ease-in-out transform ${result ? 'mb-8 translate-y-0' : 'mb-0'}`}>
          <div className={`bg-white rounded-xl shadow-sm border overflow-hidden relative group focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-500 transition-all ${isBusy ? 'border-brand-300 shadow-md ring-2 ring-brand-100' : 'border-slate-200'}`}>
            
            {/* Upload Progress Overlay */}
            {isUploading && (
              <div className="absolute inset-0 z-30 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
                 <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mb-4 animate-bounce">
                    <Upload className="w-8 h-8 text-brand-600" />
                 </div>
                 <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                    <div 
                        className="h-full bg-brand-500 transition-all duration-300 ease-out rounded-full" 
                        style={{ width: `${uploadProgress}%` }}
                    />
                 </div>
                 <p className="text-sm font-medium text-slate-600">
                    正在上传文件 <span className="text-brand-600 ml-1">{uploadProgress}%</span>
                 </p>
              </div>
            )}

            {/* Scanning Animation Overlay (Only show during initial 'loading', hide during 'streaming') */}
            {loadingState === 'loading' && (
              <div className="absolute inset-0 pointer-events-none z-10 rounded-xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-brand-500 to-transparent shadow-[0_0_15px_rgba(14,165,233,0.6)] animate-scan opacity-80"></div>
                <div className="absolute inset-0 bg-brand-50/10 backdrop-blur-[0.5px] transition-all duration-500"></div>
              </div>
            )}

            {/* Attachment Preview Overlay (if any) */}
            {attachment && (
              <div className="mx-5 mt-5 mb-2 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between animate-fade-in">
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
            )}

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isBusy}
              placeholder={attachment ? "（可选）输入对该文档的校对说明..." : "请输入或粘贴需要校对的中文文本..."}
              className={`w-full p-5 text-base sm:text-lg leading-relaxed resize-none outline-none text-slate-900 placeholder:text-slate-400 bg-transparent relative z-0 ${attachment ? 'h-32' : 'h-48 sm:h-64'} ${isBusy ? 'opacity-70' : ''} transition-opacity duration-300`}
              spellCheck={false}
            />
            
            {/* Toolbar inside Textarea */}
            <div className={`bg-slate-50 px-4 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-y-2 relative z-20 ${isBusy ? 'opacity-80 pointer-events-none' : ''}`}>
               <div className="flex items-center gap-2">
                 <input 
                   type="file" 
                   ref={fileInputRef}
                   onChange={handleFileUpload}
                   accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
                   className="hidden"
                   disabled={isBusy}
                 />
                 <button
                   onClick={() => fileInputRef.current?.click()}
                   className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-brand-600 hover:bg-white bg-transparent rounded-lg transition-colors border border-transparent hover:border-slate-200 hover:shadow-sm"
                   title="上传 PDF, Word, 图片"
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
                                <option value="spark-ultra">星火 Spark Ultra 4.0</option>
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
                  {/* Mode Toggle */}
                  <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                    <button
                      onClick={() => setMode('fast')}
                      disabled={isBusy}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'fast' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Zap className="w-3 h-3" />
                      快速
                    </button>
                    <button
                      onClick={() => setMode('professional')}
                      disabled={isBusy}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'professional' ? 'bg-purple-100 text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Sparkles className="w-3 h-3" />
                      专业深度
                    </button>
                    <button
                      onClick={() => setMode('sensitive')}
                      disabled={isBusy}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${mode === 'sensitive' ? 'bg-rose-100 text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <ShieldAlert className="w-3 h-3" />
                      合规专项
                    </button>
                  </div>

                  {(inputText.length > 0 || attachment) && (
                    <button 
                      onClick={clearInput}
                      className="text-slate-400 hover:text-red-500 text-sm flex items-center gap-1 transition-colors"
                      disabled={isBusy}
                    >
                      <Eraser className="w-4 h-4" />
                      清空
                    </button>
                  )}
               </div>
            </div>
          </div>

          {/* Rules Selection Bar */}
          {ruleLibraries.length > 0 && (
             <div className="mt-3 flex flex-wrap gap-2 items-center animate-fade-in px-1">
                 <span className="text-xs font-medium text-slate-500 mr-1 flex items-center gap-1">
                    <Book className="w-3 h-3" />
                    应用规则:
                 </span>
                 {ruleLibraries.map(lib => (
                     <button
                        key={lib.id}
                        onClick={() => toggleLibrarySelection(lib.id)}
                        disabled={isBusy}
                        className={`text-xs px-2.5 py-1 rounded border transition-all ${selectedLibIds.has(lib.id) ? 'bg-brand-50 border-brand-200 text-brand-700 font-medium' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                     >
                        {lib.name}
                     </button>
                 ))}
             </div>
          )}

          {/* Action Button */}
          <div className="mt-4 flex justify-center sm:justify-end">
            <button
              onClick={handleCheck}
              disabled={(!inputText.trim() && !attachment) || isBusy}
              className={`
                flex items-center gap-2 px-8 py-3 rounded-full text-white font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all
                ${getButtonGradient()}
              `}
            >
              {(loadingState === 'loading' || loadingState === 'streaming') ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{getButtonText()}</span>
                </>
              ) : (
                <>
                  {mode === 'sensitive' ? <ShieldAlert className="w-5 h-5"/> : <Wand2 className="w-5 h-5" />}
                  <span>{getButtonText()}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {loadingState === 'error' && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 text-red-700 animate-fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Results Section */}
        {/* Show result if success OR if streaming (partial results) */}
        {(loadingState === 'success' || loadingState === 'streaming') && result && (
           <div className="mt-8 animate-fade-in-up">
             <ResultView 
                result={result} 
                originalText={inputText} 
                onAddToWhitelist={handleAddToWhitelist}
             />
           </div>
        )}

      </main>

      {/* Footer */}
      <footer className="mt-auto py-6 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} GrammarZen. Powered by Google Gemini.</p>
      </footer>

      {/* Whitelist Modal */}
      {showWhitelistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full m-4 overflow-hidden animate-fade-in-up border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-brand-600" />
                白名单管理
              </h3>
              <button 
                onClick={() => setShowWhitelistModal(false)} 
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              {whitelist.length === 0 ? (
                <div className="text-center text-slate-500 py-10 flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                      <ShieldCheck className="w-8 h-8" />
                  </div>
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
                        <button 
                            onClick={() => handleRemoveFromWhitelist(word)}
                            className="text-slate-300 group-hover:text-red-500 transition-colors ml-1 p-0.5 rounded-full hover:bg-red-100"
                            title="移除"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        </div>
                    ))}
                    </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div>
                  {whitelist.length > 0 && (
                     <span className="text-xs text-slate-400">共 {whitelist.length} 个词汇</span>
                  )}
              </div>
              <div className="flex gap-3">
                {whitelist.length > 0 && (
                    <button 
                        onClick={clearWhitelist} 
                        className="flex items-center gap-1.5 px-4 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-red-100"
                    >
                        <Trash2 className="w-4 h-4" />
                        清空所有
                    </button>
                )}
                <button 
                    onClick={() => setShowWhitelistModal(false)}
                    className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                    完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sensitive Words Modal */}
      {showSensitiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full m-4 overflow-hidden animate-fade-in-up border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                本地敏感词库
              </h3>
              <button 
                onClick={() => setShowSensitiveModal(false)} 
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
                                onClick={() => handleLoadSystemVocabulary(vocab.path)}
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
                        onClick={() => sensitiveFileInputRef.current?.click()}
                        className="text-xs text-slate-500 hover:text-brand-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                    >
                        <Upload className="w-3 h-3" /> 
                        自定义文件导入
                    </button>
                    <input 
                        type="file" 
                        ref={sensitiveFileInputRef}
                        className="hidden"
                        accept=".txt,.csv,.json"
                        onChange={handleImportSensitiveWords}
                    />
                  </div>
                  <div className="flex gap-2">
                      <input 
                          type="text" 
                          value={newSensitiveWord}
                          onChange={(e) => setNewSensitiveWord(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddSensitiveWord()}
                          placeholder="输入敏感词..."
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                      />
                      <button 
                          onClick={handleAddSensitiveWord}
                          disabled={!newSensitiveWord.trim()}
                          className="px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                          <Plus className="w-5 h-5" />
                      </button>
                  </div>
              </div>

              {sensitiveWords.length === 0 ? (
                <div className="text-center text-slate-500 py-6 flex flex-col items-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                  <Ban className="w-10 h-10 mb-2 text-slate-300" />
                  <p className="text-sm">暂无本地敏感词</p>
                  <p className="text-xs text-slate-400 mt-1">请上方加载内置词库，或手动添加</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-[30vh] overflow-y-auto content-start p-1">
                    {sensitiveWords.map((word, index) => (
                        <div key={index} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-800 rounded-lg text-sm border border-rose-100 group hover:border-rose-300 transition-all duration-200">
                        <span className="font-medium">{word}</span>
                        <button 
                            onClick={() => handleRemoveSensitiveWord(word)}
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
                  {sensitiveWords.length > 0 && (
                     <span className="text-xs text-slate-400">共 {sensitiveWords.length} 个词汇</span>
                  )}
              </div>
              <div className="flex gap-3">
                {sensitiveWords.length > 0 && (
                    <button 
                        onClick={clearSensitiveWords} 
                        className="flex items-center gap-1.5 px-4 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-red-100"
                    >
                        <Trash2 className="w-4 h-4" />
                        清空
                    </button>
                )}
                <button 
                    onClick={() => setShowSensitiveModal(false)}
                    className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                    完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rule Manager Modal */}
      <RuleManagerModal 
        isOpen={showRuleManager}
        onClose={() => setShowRuleManager(false)}
        libraries={ruleLibraries}
        onAddLibrary={handleAddLibrary}
        onDeleteLibrary={handleDeleteLibrary}
      />
    </div>
  );
}

export default App;