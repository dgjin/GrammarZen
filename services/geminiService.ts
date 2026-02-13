import { GoogleGenAI, Type } from "@google/genai";
import { ProofreadResult, IssueType, Issue } from "../types";

const geminiApiKey = process.env.API_KEY || '';
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
const sparkApiKey = process.env.SPARK_API_KEY || '';

// Initialize Gemini client (only used if Gemini model is selected)
const googleAI = new GoogleGenAI({ apiKey: geminiApiKey });

export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export type CheckMode = 'fast' | 'professional' | 'sensitive' | 'official' | 'polishing';

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

  if (mode === 'sensitive') {
    systemInstruction = `
      你是一名严格的内容安全与合规审核专家。你的**唯一任务**是审查文本中的违规内容和敏感词。
      【检查范围】1. 用户自定义敏感词库。 2. 广告法合规（极限词）。 3. 内容安全（涉政/色情/暴力）。 4. 歧视与仇恨言论。
      【忽略项】忽略错别字、语法、文风建议。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      如果发现自定义规则库中的内容，请视为合规性要求进行检查：
      ${customRulesInstruction}
      请只返回 'sensitive' 类型的 Issue。除非原文全是乱码无法阅读，否则 'score' 评分应主要反映合规程度（100表示完全合规，分值越低违规越严重）。
    `;
  } else if (mode === 'official') {
    systemInstruction = `
      你是一名资深的党政机关公文写作与审核专家。你的任务是对用户提供的公文内容进行严格的政治把关和规范性校对。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${customRulesInstruction}
      
      请重点进行以下检查：
      1. **政治规范**：检查领导人姓名、职务、排序是否正确；专有名词（如“四个意识”、“五位一体”）表述是否准确。
      2. **公文格式与用语**：检查是否符合《党政机关公文处理工作条例》要求；用语是否庄重、严谨、得体；禁止使用口语、网络用语。
      3. **逻辑与结构**：检查层次是否清晰，逻辑是否严密，搭配是否得当。
      4. **基础校对**：检查错别字、标点符号（重点关注书名号、引号、序号的规范使用）。
      
      如果不符合公文规范的表达，请标记为 'style' (规范/格式) 或 'sensitive' (政治/合规) 类型。
      Score 评分应反映公文的规范化程度。
    `;
  } else if (mode === 'polishing') {
    systemInstruction = `
      你是一名文学功底深厚的资深编辑和改写专家。你的任务是对用户提供的文本进行**润色和改写**，使其更加通顺、优雅、专业。
      
      目标：
      1. **提升文采**：使用更精准、生动或正式的词汇替换口语化表达。
      2. **优化语流**：调整句式结构，使长短句搭配得当，阅读节奏更流畅。
      3. **保持原意**：可以大幅调整结构和用词，但**绝对不能**改变原文的核心信息和事实。
      
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${customRulesInstruction}
      
      请将你的所有修改（包括词汇替换、句式重组）记录为 'suggestion' (建议) 或 'style' (风格) 类型的 Issue。
      correctedText 应该是你润色后的完整最终版本。
      Score 评分应反映原文的文笔优美程度。
    `;
  } else if (mode === 'professional') {
    systemInstruction = `
      你是一个基于业界顶尖开源项目标准的专业中文校对引擎，兼具内容合规审核与写作风格润色功能。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${customRulesInstruction}
      请进行深度、严格的校对，重点关注：CSC (错别字/音似/形似)、语法逻辑、标点规范、内容合规与敏感词、文风与表达优化。
    `;
  } else {
    systemInstruction = `
      你是一位资深的中文编辑和校对专家。你的任务是快速检查用户提供的中文内容。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${customRulesInstruction}
      请找出：错别字、语法错误、敏感词与合规问题、简单的润色建议。
    `;
  }

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
          "type": "enum: typo, grammar, punctuation, style, suggestion, sensitive"
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
    
    // Gemini handles Schema natively via config, so we can strip the explicit JSON instruction text to save tokens, 
    // BUT keeping it in prompt makes it more robust for switching modes. 
    // For Gemini SDK, we use the `responseSchema` property which is strictly enforced.
    
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
                    type: { type: Type.STRING, enum: [IssueType.TYPO, IssueType.GRAMMAR, IssueType.PUNCTUATION, IssueType.STYLE, IssueType.SUGGESTION, IssueType.SENSITIVE] },
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