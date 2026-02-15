import { GoogleGenAI, Type } from "@google/genai";
import { ProofreadResult, IssueType, Issue } from "../types";

const geminiApiKey = process.env.API_KEY || '';
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
const sparkApiKey = process.env.SPARK_API_KEY || '';

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

// --- OpenAI Compatible Client Helper (for DeepSeek & Spark) ---

async function callOpenAICompatibleStream(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string | Part[],
  onUpdate?: (partial: ProofreadResult) => void
): Promise<ProofreadResult> {
  // Convert Part[] to text if necessary (DeepSeek/Spark primarily text via standard endpoints, multimodal handling varies)
  let userText = "";
  if (typeof userContent === 'string') {
    userText = userContent;
  } else {
    // Basic multimodal support: extract text. 
    // Note: Standard OpenAI-compatible image input is complex, simpler to strictly use text for these providers for now unless they support URL/base64 in specific standard format.
    // DeepSeek V3 supports text. Spark supports text.
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

  // Attempt robust parsing
  try {
    const cleanJson = fullText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanJson) as ProofreadResult;
  } catch (e) {
    console.warn("Final JSON Parse Error (Recovering):", e);
    // Fallback: Recover from partial JSON
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

export const checkChineseText = async (
  content: string | Part[], 
  mode: CheckMode = 'fast',
  modelName: string = 'gemini-3-flash-preview',
  whitelist: string[] = [],
  sensitiveWords: string[] = [],
  customRules: string[] = [],
  userPrompt: string = "",
  polishingTone: string = "general", // Added tone for polishing
  onUpdate?: (partial: ProofreadResult) => void
): Promise<ProofreadResult> => {

  // 1. Build System Instruction (Common for all models)
  let systemInstruction = "";
  
  const whitelistInstruction = whitelist.length > 0 
    ? `\n\n【重要】以下是用户定义的“白名单”词汇，请绝对**不要**对这些词汇进行修改、纠错或标记为敏感词，即使它们看起来像错误或违规词：\n[${whitelist.join(', ')}]\n` 
    : "";

  const sensitiveWordsInstruction = sensitiveWords.length > 0
    ? `\n\n【重要】以下是用户定义的“敏感词/违禁词库”。如果文中出现这些词，你**必须**将其标记为 'sensitive' 类型，并提供修改建议（或建议删除）。请严格执行此检查：\n[${sensitiveWords.join(', ')}]\n`
    : "";

  const customRulesInstruction = customRules.length > 0
    ? `\n\n【用户自定义校验规则库】\n除了通用的校对标准外，你**必须**严格执行以下用户指定的特殊规则。如果发现违反以下规则的内容，请标记为 'sensitive' (如果是合规类) 或 'style' (如果是格式/术语类)，并在 reason 中明确指出违反了哪条规则：\n${customRules.map((r, i) => `${i+1}. ${r}`).join('\n')}\n`
    : "";
  
  const userPromptInstruction = userPrompt.trim()
    ? `\n\n【用户临时自定义指令】\n用户对本次校对有以下特殊要求，请务必严格遵守：\n${userPrompt}\n`
    : "";
  
  // PII Instruction
  const piiInstruction = `
    \n【个人隐私信息检测】
    请严格检测并标记文本中的个人敏感信息（PII），包括但不限于：
    1. **证件号码**：身份证号、护照号、驾照号。
    2. **金融账户**：银行卡号、信用卡号。
    3. **联系方式**：手机号码、固定电话。
    4. **社保医保**：社保卡号、医保卡号。
    5. **位置信息**：详细的家庭住址（包含街道门牌号）。
    
    发现此类信息时：
    - 类型(type)必须标记为 'privacy'。
    - 建议(suggestion)应进行脱敏处理（例如：使用 '*' 遮挡中间位数，如 138****1234）。
    - 原因(reason)注明具体泄露的隐私类型（如“涉嫌泄露身份证号”）。
  `;

  if (mode === 'sensitive') {
    systemInstruction = `
      你是一名严格的内容安全与合规审核专家。你的**唯一任务**是审查文本中的违规内容和敏感词。
      【检查范围】
      1. **个人隐私信息(PII)**：严格检测身份证、银行卡、电话、社保/医保号、住址等。
      2. 用户自定义敏感词库。
      3. 广告法合规（极限词）。
      4. 内容安全（涉政/色情/暴力）。
      5. 歧视与仇恨言论。
      
      【忽略项】忽略错别字、语法、文风建议。
      
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${piiInstruction}
      
      如果发现自定义规则库中的内容，请视为合规性要求进行检查：
      ${customRulesInstruction}
      请只返回 'sensitive' 或 'privacy' 类型的 Issue。除非原文全是乱码无法阅读，否则 'score' 评分应主要反映合规程度（100表示完全合规，分值越低违规越严重）。
    `;
  } else if (mode === 'official') {
    systemInstruction = `
      你是一名资深的党政机关公文写作与审核专家。你的任务是对用户提供的公文内容进行严格的政治把关和规范性校对。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${piiInstruction}
      ${customRulesInstruction}
      
      请重点进行以下检查：
      1. **政治规范**：检查领导人姓名、职务、排序是否正确；专有名词（如“四个意识”、“五位一体”）表述是否准确。
      2. **公文格式与用语**：检查是否符合《党政机关公文处理工作条例》要求；用语是否庄重、严谨、得体；禁止使用口语、网络用语。
      3. **逻辑与结构**：检查层次是否清晰，逻辑是否严密，搭配是否得当。
      4. **基础校对**：检查错别字、标点符号（重点关注书名号、引号、序号的规范使用）。
      
      如果不符合公文规范的表达，请标记为 'style' (规范/格式) 或 'sensitive' (政治/合规) 类型。发现隐私信息标记为 'privacy'。
      Score 评分应反映公文的规范化程度。
    `;
  } else if (mode === 'polishing') {
    let toneInstruction = "";
    switch(polishingTone) {
        case 'academic':
            toneInstruction = "【风格要求：学术严谨】\n请使用客观、中立、严谨的学术语言。替换口语化表达，确保术语准确，逻辑推导严密。避免情绪化用词，注重句式的复杂度和精确性。";
            break;
        case 'business':
            toneInstruction = "【风格要求：商务职场】\n请使用简练、专业、高效的商务语言。语气要礼貌但自信，目标导向清晰。去除冗余修饰，使用标准的商务术语，展现专业素养。";
            break;
        case 'creative':
            toneInstruction = "【风格要求：文采创意】\n请使用生动、形象、富有感染力的语言。适当运用修辞手法（排比、比喻等），丰富词汇量，优化句式长短搭配，增强文章的可读性和艺术性。";
            break;
        case 'casual':
            toneInstruction = "【风格要求：口语自然】\n请使用亲切、自然、通俗易懂的语言。将生硬的书面语转化为轻松的口语表达，拉近与读者的距离，适合博客或社交媒体风格。";
            break;
        default:
            toneInstruction = "【风格要求：通用润色】\n提升文采，使用更精准、生动或正式的词汇替换口语化表达。调整句式结构，使阅读节奏更流畅。";
            break;
    }

    systemInstruction = `
      你是一名文学功底深厚的资深编辑和改写专家。你的任务是对用户提供的文本进行**润色和改写**。
      
      ${toneInstruction}
      
      目标：
      1. **保持原意**：可以大幅调整结构和用词，但**绝对不能**改变原文的核心信息和事实。
      2. **优化语流**：确保文章读起来朗朗上口，逻辑连贯。
      
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${piiInstruction}
      ${customRulesInstruction}
      
      请将你的所有修改（包括词汇替换、句式重组）记录为 'suggestion' (建议) 或 'style' (风格) 类型的 Issue。如发现隐私信息，请务必标记为 'privacy'。
      correctedText 应该是你润色后的完整最终版本。
      Score 评分应反映原文的文笔优美程度。
    `;
  } else if (mode === 'format') {
     systemInstruction = `
      你是一名专业的排版设计师和文档规范审查专家。你的任务是根据提供的文档内容（特别是图片/PDF内容），检查其排版格式是否符合标准。
      
      重点检查项目：
      1. **字体使用**：检查标题和正文字体是否统一，是否存在中西文字体混用不当。公文建议使用仿宋/黑体/楷体。
      2. **字号层级**：检查标题层级（一级、二级）字号是否清晰区分，正文字号是否合适（通常为三号或小四号）。
      3. **版面布局**：检查页边距是否过窄或过宽，段落缩进是否统一（通常首行缩进2字符）。
      4. **行间距**：检查行间距是否拥挤或过于稀疏。
      5. **标点挤压**：检查是否存在标点悬挂、行首出现句号等排版错误。
      6. **页眉页脚**：如果可见，检查页码位置是否规范。
      
      ${whitelistInstruction}
      
      请将所有发现的格式、排版、字体相关问题，标记为 'format' 类型。
      对于 'original' 字段，如果可以定位到具体文本，请填入文本；如果是全局问题（如“页边距过窄”），请填入“全局”或相关段落首句。
      Score 评分应反映文档的排版美观度和规范度。
      
      注意：请忽略错别字和内容逻辑，**只关注格式与排版**。
     `;
  } else if (mode === 'file_scan') {
    systemInstruction = `
      你是一名全能的文档审核专家。用户上传了原始文件（可能是 PDF、图片或 Word），请直接分析文件内容，进行全方位的综合检查。
      
      请根据文件的视觉呈现或提取内容，进行以下检查：
      1. **内容错误**：错别字、标点错误、语法语病。
      2. **排版格式**：字体不统一、段落错乱、标题层级不清、页边距异常等。
      3. **合规安全**：敏感词、违禁词、个人隐私泄露（PII）。
      4. **逻辑风格**：用词不当、逻辑矛盾。
      
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${piiInstruction}
      ${customRulesInstruction}
      
      注意：请尽可能还原原文的上下文。在 'original' 字段中，请准确引用原文片段。
      Score 评分应反映文档的整体质量。
    `;
  } else if (mode === 'professional') {
    systemInstruction = `
      你是一个基于业界顶尖开源项目标准的专业中文校对引擎，兼具内容合规审核与写作风格润色功能。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${piiInstruction}
      ${customRulesInstruction}
      请进行深度、严格的校对，重点关注：CSC (错别字/音似/形似)、语法逻辑、标点规范、内容合规与敏感词、隐私信息检测、文风与表达优化。
    `;
  } else {
    systemInstruction = `
      你是一位资深的中文编辑和校对专家。你的任务是快速检查用户提供的中文内容。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${piiInstruction}
      ${customRulesInstruction}
      请找出：错别字、语法错误、敏感词与合规问题、个人隐私泄露风险、简单的润色建议。
    `;
  }

  // Inject User Custom Prompt
  systemInstruction += userPromptInstruction;

  // Schema instruction for JSON Output
  systemInstruction += `
    \n**重要：必须返回纯 JSON 格式**，Schema 如下：
    {
      "correctedText": "string (The full text after all corrections)",
      "issues": [
        {
          "original": "string",
          "suggestion": "string",
          "reason": "string",
          "type": "enum: typo, grammar, punctuation, style, suggestion, sensitive, privacy, format"
        }
      ],
      "summary": "string (One sentence summary)",
      "score": number (0-100)
    }
  `;

  // 2. Dispatch to appropriate provider
  
  // --- Google Gemini ---
  if (modelName.startsWith('gemini')) {
    if (!geminiApiKey) throw new Error("Please configure Google API Key in .env");
    
    try {
      const resultStream = await googleAI.models.generateContentStream({
        model: modelName,
        contents: typeof content === 'string' ? { parts: [{ text: content }] } : { parts: content },
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
            propertyOrdering: ["correctedText", "issues", "summary", "score"] 
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
               onUpdate({
                  correctedText: partial.correctedText,
                  issues: partial.issues || [],
                  summary: partial.summary || "分析中...",
                  score: partial.score || 0
               });
            }
          }
        }
      }
      
      let cleanJson = fullText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      // Try to clean potential garbage before/after the JSON object
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      }

      try {
        return JSON.parse(cleanJson) as ProofreadResult;
      } catch (e) {
        console.warn("JSON Parse failed, attempting recovery:", e);
        // Fallback: Use manual parser
        const partial = parsePartialJson(fullText);
        if (partial.correctedText) {
             return {
                 correctedText: partial.correctedText,
                 issues: partial.issues || [],
                 summary: partial.summary || "生成中断，仅显示部分结果",
                 score: partial.score || 0
             } as ProofreadResult;
        }
        throw e; // Rethrow if not recoverable
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  } 
  
  // --- DeepSeek ---
  else if (modelName.startsWith('deepseek')) {
    if (!deepseekApiKey) throw new Error("未配置 DeepSeek API Key。请在 .env 中设置 DEEPSEEK_API_KEY。");
    // DeepSeek Endpoint
    return callOpenAICompatibleStream(
      'https://api.deepseek.com/chat/completions',
      deepseekApiKey,
      modelName, // 'deepseek-chat' or 'deepseek-reasoner'
      systemInstruction,
      content,
      onUpdate
    );
  }

  // --- iFlytek Spark (OpenAI Compatible) ---
  else if (modelName.startsWith('spark')) {
    if (!sparkApiKey) throw new Error("未配置星火大模型 API Key。请在 .env 中设置 SPARK_API_KEY。");
    
    // Map frontend model names to Spark API model versions
    // Reference: iFlytek Open Platform - OpenAI Compatible Interface
    let sparkModelVersion = 'generalv3.5'; // Default to Spark Max
    switch (modelName) {
        case 'spark-ultra': sparkModelVersion = '4.0Ultra'; break;
        case 'spark-max': sparkModelVersion = 'generalv3.5'; break;
        case 'spark-pro': sparkModelVersion = 'generalv3'; break;
        case 'spark-lite': sparkModelVersion = 'general'; break;
    }

    return callOpenAICompatibleStream(
      'https://spark-api-open.xf-yun.com/v1/chat/completions',
      sparkApiKey,
      sparkModelVersion,
      systemInstruction,
      content,
      onUpdate
    );
  }

  throw new Error(`Unsupported model: ${modelName}`);
};