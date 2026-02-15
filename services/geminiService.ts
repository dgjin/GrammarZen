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
      
      请只返回 'sensitive' 或 'privacy' 类型的 Issue。
    `;
  } else if (mode === 'official') {
    systemInstruction = `
      你是一名资深的党政机关公文审核专家。严格依据《党政机关公文处理工作条例》(GB/T 9704-2012) 和《出版物上数字用法》(GB/T 15835) 进行校对。
      
      ${whitelistInstruction}
      ${customRulesInstruction}
      
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
    // ... (Existing polishing logic, kept concise here for brevity, assuming standard prompt logic)
    systemInstruction = `
      你是一名资深编辑。任务是**润色和改写**。
      ${whitelistInstruction}
      
      风格：${polishingTone === 'academic' ? '学术严谨' : (polishingTone === 'business' ? '商务专业' : '优美流畅')}。
      目标：保持原意，提升文采，优化句式。
      
      请记录所有修改为 'suggestion' 或 'style'。correctedText 为最终润色版本。
    `;
  } else if (mode === 'format') {
     systemInstruction = `
      你是一名排版设计师。根据内容检查排版格式。
      重点：字体统一性、标点挤压（禁止行首标点）、全角半角混用、段落缩进。
      ${whitelistInstruction}
      只关注 'format' 类型问题。
     `;
  } else if (mode === 'professional') {
    systemInstruction = `
      你是一个专业中文校对引擎。
      ${whitelistInstruction}
      ${linguisticRules}
      ${piiInstruction}
      ${sensitiveWordsInstruction}
      
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

  // 2. Dispatch to appropriate provider
  let rawResult: ProofreadResult;
  
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

      rawResult = JSON.parse(cleanJson) as ProofreadResult;
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
      content,
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
      content,
      onUpdate
    );
  } else {
    throw new Error(`Unsupported model: ${modelName}`);
  }

  // 3. Post-Process: Enforce Whitelist Reversion
  return postProcessResult(rawResult, whitelist);
};