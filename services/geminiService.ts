import { GoogleGenAI, Type } from "@google/genai";
import { ProofreadResult, IssueType, Issue } from "../types";
import { parsePartialJson } from "./parsePartialJson";

const geminiApiKey = process.env.API_KEY || '';
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
const sparkApiKey = process.env.SPARK_API_KEY || '';
const kimiApiKey = process.env.KIMI_API_KEY || '';
  const minmaxApiKey = process.env.MINMAX_API_KEY || '';

// Initialize Gemini client (only used if Gemini model is selected)
// Prevent crash if API Key is missing during module load
let googleAI: GoogleGenAI;
try {
  googleAI = new GoogleGenAI({ apiKey: geminiApiKey || 'DUMMY_KEY_TO_PREVENT_CRASH' });
} catch (e) {
  console.warn("Failed to initialize GoogleGenAI client:", e);
}

export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export type CheckMode = 'fast' | 'professional' | 'sensitive' | 'official' | 'polishing' | 'format' | 'file_scan';

export type IndustryType = 'general' | 'academic' | 'technical' | 'social' | 'business' | 'legal';

// Industry-specific templates
const industryTemplates: Record<IndustryType, {
  name: string;
  description: string;
  systemInstruction: string;
}> = {
  general: {
    name: '通用',
    description: '适用于一般文本校对',
    systemInstruction: ''
  },
  academic: {
    name: '学术论文',
    description: '适用于学术论文、研究报告',
    systemInstruction: `
      你是一名学术论文校对专家。请严格按照学术写作规范进行校对：
      1. 检查学术术语的正确使用
      2. 确保论证逻辑清晰
      3. 检查引用格式是否规范
      4. 保持学术语言的严谨性和客观性
      5. 避免口语化表达
    `
  },
  technical: {
    name: '技术文档',
    description: '适用于技术手册、API文档',
    systemInstruction: `
      你是一名技术文档校对专家。请按照技术写作规范进行校对：
      1. 检查技术术语的一致性
      2. 确保步骤说明清晰易懂
      3. 检查代码示例的正确性
      4. 保持语言简洁明了
      5. 确保专业术语的准确使用
    `
  },
  social: {
    name: '社交媒体',
    description: '适用于社交媒体、营销文案',
    systemInstruction: `
      你是一名社交媒体内容专家。请按照社交媒体写作规范进行校对：
      1. 保持语言活泼、有吸引力
      2. 检查网络用语的适当使用
      3. 确保内容符合平台规范
      4. 优化表达方式，提高互动性
      5. 检查是否有敏感内容
    `
  },
  business: {
    name: '商务文档',
    description: '适用于商务邮件、合同文件',
    systemInstruction: `
      你是一名商务文档校对专家。请按照商务写作规范进行校对：
      1. 保持语言专业、得体
      2. 检查商务术语的正确使用
      3. 确保表达清晰、准确
      4. 避免模糊或歧义的表述
      5. 检查格式和结构是否规范
    `
  },
  legal: {
    name: '法律文书',
    description: '适用于法律文件、合同条款',
    systemInstruction: `
      你是一名法律文书校对专家。请按照法律写作规范进行校对：
      1. 检查法律术语的准确使用
      2. 确保表述严谨、无歧义
      3. 检查条款逻辑的一致性
      4. 保持语言正式、专业
      5. 确保格式符合法律文书规范
    `
  }
};

/**
 * Extracts specific validation rules. Defaults to Gemini for this helper task.
 */
export const extractRulesFromText = async (content: string): Promise<{ name: string; description: string; rules: string[] }> => {
  if (!geminiApiKey) throw new Error("Google API Key is missing for rule extraction");

  const model = "gemini-3-flash-preview";
  
  const prompt = `
    你是一个专业的文档分析师。请分析用户提供的“写作规范”或“校验规则”文档内容。
    
    任务：
    1. 为这套规则起一个简短的名字（name）。
    2. 用一句话描述这套规则的适用场景（description）。
    3. 提取出所有具体的、可执行的文本校验规则（rules）。例如：“禁止使用第一人称”、“必须使用中文全角标点”、“将‘APP’统一写作‘App’”。
    
    请忽略文档中的无关废话，只提取核心约束条件。
    返回 JSON 格式。
  `;

  try {
    const response = await googleAI.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          { text: `文档内容如下：\n${content}` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            rules: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["name", "description", "rules"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("Empty response from Gemini");
    
    // Clean markdown if present (fixes potential JSON parse errors)
    const cleanJson = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Rule Extraction Error:", error);
    throw error;
  }
};

/**
 * Helper to extract partial data from incomplete JSON string.
 */
const parsePartialJson = (json: string): Partial<ProofreadResult> => {
  const result: Partial<ProofreadResult> = {};
  
  // Clean markdown code blocks if present
  let cleanJson = json.replace(/^```json\s*/, '').replace(/\s*```$/, '');

  // 1. Extract correctedText
  // Matches "correctedText": "..." taking into account escaped quotes
  const textMatch = cleanJson.match(/"correctedText"\s*:\s*"(.*?)(?:(?<!\\)"|$)/s);
  if (textMatch) {
    let rawText = textMatch[1];
    try {
      // If the string was truncated (no closing quote), we shouldn't add one blindly for JSON.parse
      // But for display, we want the raw text.
      // If it ends with backslash, remove it to avoid JSON parse error if we were to reconstruct
      if (rawText.endsWith('\\') && !rawText.endsWith('\\\\')) {
        rawText = rawText.slice(0, -1);
      }
      // Decode unicode escapes manually or simple replacement if JSON.parse fails?
      // Simple approach: unescape \" and \\
      result.correctedText = rawText
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
    } catch (e) {
      result.correctedText = rawText;
    }
  }

  // 2. Extract Issues
  const issuesMatch = cleanJson.match(/"issues"\s*:\s*\[(.*)/s);
  if (issuesMatch) {
    const content = issuesMatch[1];
    const issues: Issue[] = [];
    // Simple heuristic to match {...} objects. 
    // WARNING: Fails if objects contain nested braces. Issue objects are flat, so usually fine.
    const objectRegex = /{[^{}]+}/g;
    const foundObjects = content.match(objectRegex);
    
    if (foundObjects) {
      foundObjects.forEach(objStr => {
        try {
          const obj = JSON.parse(objStr);
          if (obj.original && obj.suggestion && obj.type) {
            issues.push(obj);
          }
        } catch (e) {
          // Ignore incomplete objects
        }
      });
    }
    result.issues = issues;
  }

  // 3. Extract Summary & Score (Best effort)
  const summaryMatch = cleanJson.match(/"summary"\s*:\s*"(.*?)(?:(?<!\\)"|$)/s);
  if (summaryMatch) result.summary = summaryMatch[1];

  const scoreMatch = cleanJson.match(/"score"\s*:\s*(\d+)/);
  if (scoreMatch) result.score = parseInt(scoreMatch[1], 10);

  return result;
};

/**
 * FORCE Whitelist Enforcement Logic
 * Post-processes the AI result to revert any changes made to whitelisted words.
 */
const postProcessResult = (result: ProofreadResult, whitelist: string[]): ProofreadResult => {
  if (!result || whitelist.length === 0) return result;

  const filteredIssues = result.issues.filter(issue => {
    // Check if the original text matches any whitelist word (case-insensitive for robustness)
    const isWhitelisted = whitelist.some(w => w.trim().toLowerCase() === issue.original.trim().toLowerCase());
    
    // Also check if the AI tried to change PART of a whitelisted word? 
    // For simplicity and safety, we check exact match or containment
    // If the issue.original is EXACTLY in the whitelist, we drop the issue.
    if (isWhitelisted) {
        // We also need to REVERT the text change in correctedText.
        // This is tricky because correctedText is a full string.
        // Simple heuristic: If suggestion exists in correctedText, replace it back with original.
        // WARNING: This assumes the suggestion is unique or context-free. 
        // A robust diff-patch is safer, but replacing string is a good 90% solution for single words.
        if (result.correctedText.includes(issue.suggestion)) {
            // Only revert if we are reasonably sure
             result.correctedText = result.correctedText.replace(issue.suggestion, issue.original);
        }
        return false; // Remove this issue
    }
    return true; // Keep this issue
  });

  return {
    ...result,
    issues: filteredIssues
  };
};

// --- OpenAI Compatible Client Helper (for DeepSeek & Spark) ---

async function callOpenAICompatibleStream(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string | Part[],
  onUpdate?: (partial: ProofreadResult) => void
): Promise<ProofreadResult> {
  // Convert Part[] to text if necessary
  let userText = "";
  if (typeof userContent === 'string') {
    userText = userContent;
  } else {
    userText = userContent.map(p => p.text || "").join("\n");
    if (userContent.some(p => p.inlineData)) {
      console.warn("Image input detected. Current DeepSeek/Spark integration focuses on text proofreading.");
      userText += "\n[注：用户上传了图片，但当前模型仅处理提取的文本内容]";
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText }
      ],
      stream: true,
      response_format: { type: 'json_object' } // Enforce JSON mode
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error (${model}): ${err}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.trim() === '') continue;
      if (line.trim() === 'data: [DONE]') continue;
      
      if (line.startsWith('data: ')) {
        try {
          const jsonStr = line.replace('data: ', '');
          const data = JSON.parse(jsonStr);
          const content = data.choices[0]?.delta?.content || "";
          
          if (content) {
            fullText += content;
            if (onUpdate) {
               const partial = parsePartialJson(fullText);
               if (partial.correctedText) {
                 onUpdate({
                    correctedText: partial.correctedText,
                    issues: partial.issues || [],
                    summary: partial.summary || "分析中...",
                    score: partial.score || 0
                 });
               }
            }
          }
        } catch (e) {
          console.warn("SSE Parse Error", e);
        }
      }
    }
  }

  try {
    const cleanJson = fullText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanJson) as ProofreadResult;
  } catch (e) {
    console.warn("Final JSON Parse Error (Recovering):", e);
    const partial = parsePartialJson(fullText);
    if (partial.correctedText) {
       return {
         correctedText: partial.correctedText,
         issues: partial.issues || [],
         summary: partial.summary || "分析完成（部分数据可能丢失）",
         score: partial.score || 80
       } as ProofreadResult;
    }
    throw new Error("模型返回的不是有效的 JSON 格式");
  }
}

// --- Main Function ---

// Helper function to split long text into chunks with context preservation
const splitTextIntoChunks = (text: string, maxChunkSize: number = 4000, overlapSize: number = 200): string[] => {
  const chunks: string[] = [];
  let currentPosition = 0;
  const textLength = text.length;
  
  // Smart chunking with context preservation
  while (currentPosition < textLength) {
    // Calculate end position for current chunk
    let endPosition = Math.min(currentPosition + maxChunkSize, textLength);
    
    // Try to split at paragraph boundaries first
    const nextParagraphIndex = text.indexOf('\n\n', currentPosition + maxChunkSize * 0.8);
    if (nextParagraphIndex !== -1 && nextParagraphIndex < endPosition + 500) {
      endPosition = nextParagraphIndex + 2; // Include the paragraph break
    }
    // If no paragraph break, try to split at sentence boundaries
    else {
      const sentenceEndings = text.substring(currentPosition + maxChunkSize * 0.8, endPosition).match(/[。！？.!?]/g);
      if (sentenceEndings && sentenceEndings.length > 0) {
        const lastSentenceEnd = text.lastIndexOf(sentenceEndings[sentenceEndings.length - 1], endPosition);
        if (lastSentenceEnd !== -1 && lastSentenceEnd > currentPosition + maxChunkSize * 0.5) {
          endPosition = lastSentenceEnd + 1;
        }
      }
    }
    
    // Extract current chunk
    let chunk = text.substring(currentPosition, endPosition);
    
    // Add overlap from previous chunk for context preservation
    if (currentPosition > 0) {
      const overlapStart = Math.max(0, currentPosition - overlapSize);
      const overlap = text.substring(overlapStart, currentPosition);
      chunk = overlap + chunk;
    }
    
    chunks.push(chunk);
    currentPosition = endPosition;
  }
  
  return chunks;
};

// Helper function to merge multiple proofread results with overlap handling
const mergeResults = (results: ProofreadResult[]): ProofreadResult => {
  if (results.length === 0) {
    return {
      correctedText: '',
      issues: [],
      summary: '无内容可处理',
      score: 0
    };
  }
  
  if (results.length === 1) {
    return results[0];
  }
  
  // Merge corrected text with overlap handling
  let mergedText = results[0].correctedText;
  const overlapSize = 200; // Should match the overlap size in splitTextIntoChunks
  
  for (let i = 1; i < results.length; i++) {
    const currentText = results[i].correctedText;
    // Find the overlap point and remove duplicate content
    let overlapStart = 0;
    for (let j = Math.max(0, currentText.length - overlapSize * 2); j < currentText.length; j++) {
      const suffix = currentText.substring(j);
      if (mergedText.endsWith(suffix)) {
        overlapStart = j;
        break;
      }
    }
    mergedText += currentText.substring(overlapStart);
  }
  
  // Merge issues, removing duplicates
  const uniqueIssues = new Map<string, Issue>();
  results.forEach(result => {
    result.issues.forEach(issue => {
      // Create a unique key for each issue
      const key = `${issue.original}-${issue.suggestion}-${issue.type}`;
      if (!uniqueIssues.has(key)) {
        uniqueIssues.set(key, issue);
      }
    });
  });
  
  const issues = Array.from(uniqueIssues.values());
  const score = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  const summary = `共处理 ${results.length} 个文本片段，平均评分 ${score} 分`;
  
  return {
    correctedText: mergedText,
    issues,
    summary,
    score
  };
};

// Cache related functions
const CACHE_KEY_PREFIX = 'grammarzen_cache_';
const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

interface CachedResult {
  result: ProofreadResult;
  timestamp: number;
}

// Generate cache key based on content and parameters
const generateCacheKey = (content: string | Part[], mode: CheckMode, modelName: string, industry: IndustryType = 'general'): string => {
  let contentHash: string;
  if (typeof content === 'string') {
    // Simple hash for string content
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    contentHash = hash.toString(36);
  } else {
    // For Part[] content, use the length and first part as hash
    const textContent = content.map(p => p.text || '').join('');
    contentHash = textContent.length.toString(36);
  }
  return `${CACHE_KEY_PREFIX}${mode}_${modelName}_${industry}_${contentHash}`;
};

// Get cached result
const getCachedResult = (key: string): ProofreadResult | null => {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const parsed: CachedResult = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is expired
    if (now - parsed.timestamp > CACHE_EXPIRY_TIME) {
      localStorage.removeItem(key);
      return null;
    }
    
    return parsed.result;
  } catch (e) {
    console.warn('Cache read error:', e);
    return null;
  }
};

// Set cached result
const setCachedResult = (key: string, result: ProofreadResult): void => {
  try {
    const cached: CachedResult = {
      result,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (e) {
    console.warn('Cache write error:', e);
  }
};

// Clear old cache entries
const clearOldCache = (): void => {
  try {
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const parsed: CachedResult = JSON.parse(cached);
            if (now - parsed.timestamp > CACHE_EXPIRY_TIME) {
              keysToRemove.push(key);
            }
          }
        } catch (e) {
          // Remove invalid cache entries
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Cache cleanup error:', e);
  }
};

// Clear old cache on module load
clearOldCache();

// Custom segmentation rules interface
interface SegmentationRule {
  pattern: string;
  description: string;
}

// Default segmentation rules
const defaultSegmentationRules: SegmentationRule[] = [
  { pattern: '人工智能', description: '固定词组' },
  { pattern: '机器学习', description: '固定词组' },
  { pattern: '深度学习', description: '固定词组' },
  { pattern: '自然语言处理', description: '固定词组' },
  { pattern: '计算机视觉', description: '固定词组' }
];

// Simple Chinese word segmentation function with custom rules
const segmentChineseText = (text: string, customRules: SegmentationRule[] = []): string[] => {
  // Combine default and custom rules
  const allRules = [...defaultSegmentationRules, ...customRules];
  
  // Sort rules by length (longer patterns first)
  allRules.sort((a, b) => b.pattern.length - a.pattern.length);
  
  // Basic segmentation rules
  const segments: string[] = [];
  let i = 0;
  
  while (i < text.length) {
    const char = text[i];
    const charCode = char.charCodeAt(0);
    
    // Check if it's a Chinese character (Unicode range for common Chinese characters)
    const isChinese = charCode >= 0x4E00 && charCode <= 0x9FFF;
    // Check if it's a number
    const isNumber = /\d/.test(char);
    // Check if it's a letter
    const isLetter = /[a-zA-Z]/.test(char);
    // Check if it's a punctuation
    const isPunctuation = /[，。！？；：""''（）【】]/.test(char);
    
    if (isPunctuation) {
      segments.push(char);
      i++;
    } else if (isChinese) {
      // Check for custom rules first
      let matched = false;
      for (const rule of allRules) {
        if (text.substr(i, rule.pattern.length) === rule.pattern) {
          segments.push(rule.pattern);
          i += rule.pattern.length;
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        // Default single character segmentation for Chinese
        segments.push(char);
        i++;
      }
    } else if (isNumber || isLetter) {
      // Group numbers and letters together
      let currentSegment = char;
      i++;
      
      while (i < text.length) {
        const nextChar = text[i];
        const nextIsNumber = /\d/.test(nextChar);
        const nextIsLetter = /[a-zA-Z]/.test(nextChar);
        
        if (nextIsNumber || nextIsLetter) {
          currentSegment += nextChar;
          i++;
        } else {
          break;
        }
      }
      
      segments.push(currentSegment);
    } else {
      // Handle spaces and other characters
      i++;
    }
  }
  
  return segments;
};

// Function to enhance proofreading with segmentation
const enhanceWithSegmentation = (text: string, customRules: SegmentationRule[] = []): string => {
  const segments = segmentChineseText(text, customRules);
  // For now, we just return the original text, but we can use the segments for better analysis
  return text;
};

export const checkChineseText = async (
  content: string | Part[], 
  mode: CheckMode = 'fast',
  modelName: string = 'gemini-3-flash-preview',
  whitelist: string[] = [],
  sensitiveWords: string[] = [],
  customRules: string[] = [],
  userPrompt: string = "",
  polishingTone: string = "general", // Added tone for polishing
  industry: IndustryType = 'general', // Added industry template
  onUpdate?: (partial: ProofreadResult) => void
): Promise<ProofreadResult> => {
  let rawResult: ProofreadResult;

  // 1. Check cache first
  const cacheKey = generateCacheKey(content, mode, modelName, industry);
  const cachedResult = getCachedResult(cacheKey);
  if (cachedResult) {
    if (onUpdate) {
      onUpdate(cachedResult);
    }
    return cachedResult;
  }

  // 2. Enhance text with segmentation if it's a string
  let enhancedContent = content;
  if (typeof content === 'string') {
    // Convert custom rules to SegmentationRule format
    const segmentationRules: SegmentationRule[] = customRules.map(rule => ({
      pattern: rule,
      description: 'Custom rule'
    }));
    enhancedContent = enhanceWithSegmentation(content, segmentationRules);
  }

  // 3. Build System Instruction (Common for all models)
  let systemInstruction = "";
  
  // Add industry-specific instruction
  const industryInstruction = industry !== 'general' 
    ? `\n\n【行业特定规范】\n${industryTemplates[industry].systemInstruction}` 
    : "";
  
  const whitelistInstruction = whitelist.length > 0 
    ? `\n\n【绝对指令：白名单】\n以下词汇是用户指定的专用术语/人名，你**绝不能**对其进行任何修改、替换或纠错，必须保留原文：\n[${whitelist.join(', ')}]\n如果原文中出现了这些词，即使你认为有错，也请**忽略**。` 
    : "";

  const sensitiveWordsInstruction = sensitiveWords.length > 0
    ? `\n\n【绝对指令：违禁词库】\n以下是必须检测出的敏感词/违禁词。如果文中出现，必须标记为 'sensitive' 类型，建议修改或删除：\n[${sensitiveWords.join(', ')}]\n`
    : "";

  const customRulesInstruction = customRules.length > 0
    ? `\n\n【用户自定义校验规则】\n严格执行以下规则，违反者标记为 'style' 或 'sensitive'：\n${customRules.map((r, i) => `${i+1}. ${r}`).join('\n')}\n`
    : "";
  
  const userPromptInstruction = userPrompt.trim()
    ? `\n\n【用户临时指令】\n${userPrompt}\n`
    : "";
  
  // Specific Linguistic Enhancements
  const linguisticRules = `
    \n【中文语言规范重点】
    1. **"的、地、得"辨析**：严格区分用法。
       - "的"：形容词+的+名词 (如：红色的苹果)。
       - "地"：副词+地+动词 (如：飞快地跑)。
       - "得"：动词+得+副词 (如：跑得飞快)。
       - 示例：{"original": "高兴的跳起来", "suggestion": "高兴地跳起来", "type": "grammar", "reason": "‘跳’是动词，修饰语应使用‘地’"}
    2. **标点符号**：
       - 中文环境下必须使用全角标点（，。！？），禁止中西文标点混用（如中文句子中使用半角逗号,）。
       - 检查成对标点（“”‘’（）《》）是否闭合。
  `;

  const piiInstruction = `
    \n【隐私检测】
    标记所有个人敏感信息（身份证、电话、银行卡、详细住址）。类型标记为 'privacy'，建议脱敏处理。
  `;

  if (mode === 'sensitive') {
    systemInstruction = `
      你是一名严格的内容安全审核专家。你的**唯一任务**是审查违规内容。
      【忽略】错别字、语法、文风问题。
      【重点】
      1. **个人隐私(PII)**：身份证、电话、住址。
      2. **广告法合规**：极限词（第一、顶级、最佳）。
      3. **敏感词库**：${sensitiveWords.join(', ')}。
      4. **政治与不当言论**。
      
      ${whitelistInstruction}
      ${industryInstruction}
      
      请只返回 'sensitive' 或 'privacy' 类型的 Issue。
    `;
  } else if (mode === 'official') {
    systemInstruction = `
      你是一名资深的党政机关公文审核专家。严格依据《党政机关公文处理工作条例》(GB/T 9704-2012) 和《出版物上数字用法》(GB/T 15835) 进行校对。
      
      ${whitelistInstruction}
      ${customRulesInstruction}
      ${industryInstruction}
      
      【检查重点】
      1. **政治规范**：领导人姓名、职务、排序及政治术语（“四个意识”等）必须准确无误。
      2. **数字用法**：
         - 汉字数字后用顿号（如“一、”），阿拉伯数字后用下脚点（如“1.”）。
         - 带括号的序号后面不加标点（如“（一）内容”）。
      3. **公文用语**：严禁口语化、网络用语。使用庄重、严谨的书面语。
      4. **标点规范**：重点检查书名号、引号、序号的层级和用法。
      
      违反规范请标记为 'style' (规范) 或 'sensitive' (政治)。
    `;
  } else if (mode === 'polishing') {
    const toneMap: Record<string, string> = {
      'academic': '学术严谨、客观中立',
      'business': '商务专业、得体大方',
      'creative': '富有创意、生动形象',
      'casual': '亲切随和、口语化',
      'general': '优美流畅、自然大方'
    };
    const toneDesc = toneMap[polishingTone] || toneMap['general'];

    systemInstruction = `
      你是一名资深编辑和文案专家。你的任务是**润色和改写**用户提供的文本。
      
      【润色目标】
      1. **提升文采**：优化词汇选择，使表达更精准、丰富。
      2. **优化句式**：改善句子结构，使逻辑更清晰，读起来更顺畅。
      3. **保持原意**：在不改变作者初衷的前提下进行优化。
      4. **风格对齐**：当前要求的润色风格是【${toneDesc}】。
      
      ${whitelistInstruction}
      ${industryInstruction}
      
      【输出要求】
      1. **correctedText**：必须包含完整的润色后的文本。
      2. **issues**：记录主要的修改点。类型标记为 'suggestion' 或 'style'。
      3. **summary**：简要说明润色的重点。
      4. **score**：对原稿质量的评分（0-100）。
    `;
  } else if (mode === 'format') {
     systemInstruction = `
      你是一名排版设计师。根据内容检查排版格式。
      重点：字体统一性、标点挤压（禁止行首标点）、全角半角混用、段落缩进。
      ${whitelistInstruction}
      ${industryInstruction}
      只关注 'format' 类型问题。
     `;
  } else if (mode === 'professional') {
    systemInstruction = `
      你是一个专业中文校对引擎。
      ${whitelistInstruction}
      ${linguisticRules}
      ${piiInstruction}
      ${sensitiveWordsInstruction}
      ${industryInstruction}
      
      请进行深度校对，覆盖：CSC (拼写纠错)、语法逻辑、标点规范、合规敏感词。
    `;
  } else {
    // Fast mode
    systemInstruction = `
      你是一名中文校对专家。快速检查：
      1. 错别字。
      2. 明显语病。
      3. 标点错误。
      ${whitelistInstruction}
      ${linguisticRules}
      ${industryInstruction}
    `;
  }

  systemInstruction += userPromptInstruction;
  systemInstruction += `
    \n**重要：返回纯 JSON**。
    Schema:
    {
      "correctedText": "string",
      "issues": [
        { "original": "string", "suggestion": "string", "reason": "string", "type": "enum: typo, grammar, punctuation, style, suggestion, sensitive, privacy, format" }
      ],
      "summary": "string",
      "score": number
    }
  `;

  // 2. Check if content is long text and needs chunking
  if (typeof enhancedContent === 'string' && enhancedContent.length > 8000) {
    const chunks = splitTextIntoChunks(enhancedContent);
    const results: ProofreadResult[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Create a partial update function to show progress
      const chunkOnUpdate = onUpdate ? (partial: ProofreadResult) => {
        const progress = Math.round(((i + 1) / chunks.length) * 100);
        onUpdate({
          ...partial,
          summary: `正在处理第 ${i + 1}/${chunks.length} 段 (${progress}%)...`
        });
      } : undefined;
      
      // Recursively call checkChineseText for each chunk
      const chunkResult = await checkChineseText(
        chunk,
        mode,
        modelName,
        whitelist,
        sensitiveWords,
        customRules,
        userPrompt,
        polishingTone,
        chunkOnUpdate
      );
      results.push(chunkResult);
    }
    
    // Merge results
    rawResult = mergeResults(results);
  } else {
    // Original single chunk processing
    if (modelName.startsWith('gemini')) {
      if (!geminiApiKey) throw new Error("Please configure Google API Key in .env");
      
      try {
        const resultStream = await googleAI.models.generateContentStream({
          model: modelName,
          contents: typeof enhancedContent === 'string' ? { parts: [{ text: enhancedContent }] } : { parts: enhancedContent },
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                correctedText: { type: Type.STRING },
                issues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      original: { type: Type.STRING },
                      suggestion: { type: Type.STRING },
                      reason: { type: Type.STRING },
                      type: { type: Type.STRING, enum: [IssueType.TYPO, IssueType.GRAMMAR, IssueType.PUNCTUATION, IssueType.STYLE, IssueType.SUGGESTION, IssueType.SENSITIVE, IssueType.PRIVACY, IssueType.FORMAT] },
                    },
                    required: ["original", "suggestion", "reason", "type"],
                  },
                },
                summary: { type: Type.STRING },
                score: { type: Type.NUMBER },
              },
              required: ["correctedText", "summary", "score", "issues"],
            },
          },
        });

        let fullText = "";
        for await (const chunk of resultStream) {
          const text = chunk.text;
          if (text) {
            fullText += text;
            if (onUpdate) {
              const partial = parsePartialJson(fullText);
              if (partial.correctedText) {
                 onUpdate(partial as ProofreadResult);
              }
            }
          }
        }
        
        let cleanJson = fullText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }

        try {
          rawResult = JSON.parse(cleanJson) as ProofreadResult;
        } catch (e) {
          console.warn("Gemini JSON Parse Error (Recovering):", e);
          const partial = parsePartialJson(fullText);
          if (partial.correctedText) {
             rawResult = {
               correctedText: partial.correctedText,
               issues: partial.issues || [],
               summary: partial.summary || "分析完成（部分数据可能丢失）",
               score: partial.score || 80
             } as ProofreadResult;
          } else {
             throw new Error("模型返回的不是有效的 JSON 格式");
          }
        }
      } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
      }
    }
    else if (modelName.startsWith('deepseek')) {
      if (!deepseekApiKey) throw new Error("未配置 DeepSeek API Key");
      rawResult = await callOpenAICompatibleStream(
        'https://api.deepseek.com/chat/completions',
        deepseekApiKey,
        modelName,
        systemInstruction,
        enhancedContent,
        onUpdate
      );
    }
    else if (modelName.startsWith('spark')) {
      if (!sparkApiKey) throw new Error("未配置星火 API Key");
      let sparkModelVersion = 'generalv3.5';
      switch (modelName) {
          case 'spark-ultra': sparkModelVersion = '4.0Ultra'; break;
          case 'spark-max': sparkModelVersion = 'generalv3.5'; break;
          case 'spark-pro': sparkModelVersion = 'generalv3'; break;
          case 'spark-lite': sparkModelVersion = 'general'; break;
      }
      rawResult = await callOpenAICompatibleStream(
        'https://spark-api-open.xf-yun.com/v1/chat/completions',
        sparkApiKey,
        sparkModelVersion,
        systemInstruction,
        enhancedContent,
        onUpdate
      );
    }
    else if (modelName.startsWith('moonshot')) {
      if (!kimiApiKey) throw new Error("未配置 Kimi (Moonshot) API Key");
      rawResult = await callOpenAICompatibleStream(
        'https://api.moonshot.cn/v1/chat/completions',
        kimiApiKey,
        modelName,
        systemInstruction,
        enhancedContent,
        onUpdate
      );
    } else if (modelName.startsWith('min-max')) {
      if (!minmaxApiKey) throw new Error("未配置 Min-Max API Key");
      rawResult = await callOpenAICompatibleStream(
        'https://api.minimax.chat/v1/text/chatcompletion',
        minmaxApiKey,
        'abab5.5-chat',
        systemInstruction,
        enhancedContent,
        onUpdate
      );
    } else {
      throw new Error(`Unsupported model: ${modelName}`);
    }
  }

  // 3. Post-Process: Enforce Whitelist Reversion
  const finalResult = postProcessResult(rawResult, whitelist);
  
  // 4. Cache the result
  setCachedResult(cacheKey, finalResult);
  
  return finalResult;
};