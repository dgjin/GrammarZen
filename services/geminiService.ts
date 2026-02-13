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

export type CheckMode = 'fast' | 'professional' | 'sensitive';

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
    
    return JSON.parse(jsonText);
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
  const textMatch = cleanJson.match(/"correctedText"\s*:\s*"(.*?)(?:(?<!\\)"|$)/s);
  if (textMatch) {
    let rawText = textMatch[1];
    try {
      if (rawText.endsWith('\\') && !rawText.endsWith('\\\\')) {
        rawText = rawText.slice(0, -1);
      }
      result.correctedText = JSON.parse(`"${rawText}"`);
    } catch (e) {
      result.correctedText = rawText;
    }
  }

  // 2. Extract Issues
  const issuesMatch = cleanJson.match(/"issues"\s*:\s*\[(.*)/s);
  if (issuesMatch) {
    const content = issuesMatch[1];
    const issues: Issue[] = [];
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

  try {
    const cleanJson = fullText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanJson) as ProofreadResult;
  } catch (e) {
    console.error("Final JSON Parse Error", fullText);
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
      const cleanJson = fullText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      return JSON.parse(cleanJson) as ProofreadResult;
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
    // Spark OpenAI-Compatible Endpoint
    // Note: 'spark-ultra' maps to '4.0Ultra' usually, but user selects '4.0Ultra' in dropdown
    return callOpenAICompatibleStream(
      'https://spark-api-open.xf-yun.com/v1/chat/completions',
      sparkApiKey,
      modelName === 'spark-ultra' ? '4.0Ultra' : 'generalv3.5', // Simple mapping if needed, or pass direct
      systemInstruction,
      content,
      onUpdate
    );
  }

  throw new Error(`Unsupported model: ${modelName}`);
};