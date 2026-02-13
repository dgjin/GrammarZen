import { GoogleGenAI, Type } from "@google/genai";
import { ProofreadResult, IssueType, Issue } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export type CheckMode = 'fast' | 'professional' | 'sensitive';

/**
 * Extracts specific validation rules from a raw document text using Gemini.
 */
export const extractRulesFromText = async (content: string): Promise<{ name: string; description: string; rules: string[] }> => {
  if (!apiKey) throw new Error("API Key is missing");

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
    const response = await ai.models.generateContent({
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
  // Regex looks for "correctedText": "VALUE"
  // It handles the case where the closing quote hasn't arrived yet.
  const textMatch = cleanJson.match(/"correctedText"\s*:\s*"(.*?)(?:(?<!\\)"|$)/s);
  if (textMatch) {
    let rawText = textMatch[1];
    // Attempt to unescape standard JSON escapes if possible
    try {
      // If the string is incomplete (no closing quote in original), it might end with a backslash
      if (rawText.endsWith('\\') && !rawText.endsWith('\\\\')) {
        rawText = rawText.slice(0, -1);
      }
      // Wrap in quotes to parse as a valid JSON string
      result.correctedText = JSON.parse(`"${rawText}"`);
    } catch (e) {
      // Fallback: use raw captured text
      result.correctedText = rawText;
    }
  }

  // 2. Extract Issues
  // Look for "issues": [ ...
  const issuesMatch = cleanJson.match(/"issues"\s*:\s*\[(.*)/s);
  if (issuesMatch) {
    const content = issuesMatch[1];
    const issues: Issue[] = [];
    
    // Naively find complete objects { ... }
    // This regex assumes issues don't have nested braces in their string values, which is generally true for this schema.
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

export const checkChineseText = async (
  content: string | Part[], 
  mode: CheckMode = 'fast',
  modelName: string = 'gemini-3-flash-preview',
  whitelist: string[] = [],
  sensitiveWords: string[] = [],
  customRules: string[] = [],
  onUpdate?: (partial: ProofreadResult) => void
): Promise<ProofreadResult> => {
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  // Use the passed model name
  const model = modelName;

  let systemInstruction = "";
  
  // Construct whitelist instruction
  const whitelistInstruction = whitelist.length > 0 
    ? `\n\n【重要】以下是用户定义的“白名单”词汇，请绝对**不要**对这些词汇进行修改、纠错或标记为敏感词，即使它们看起来像错误或违规词：\n[${whitelist.join(', ')}]\n` 
    : "";

  // Construct sensitive words instruction
  const sensitiveWordsInstruction = sensitiveWords.length > 0
    ? `\n\n【重要】以下是用户定义的“敏感词/违禁词库”。如果文中出现这些词，你**必须**将其标记为 'sensitive' 类型，并提供修改建议（或建议删除）。请严格执行此检查：\n[${sensitiveWords.join(', ')}]\n`
    : "";

  // Construct Custom Rules Instruction
  const customRulesInstruction = customRules.length > 0
    ? `\n\n【用户自定义校验规则库】\n除了通用的校对标准外，你**必须**严格执行以下用户指定的特殊规则。如果发现违反以下规则的内容，请标记为 'sensitive' (如果是合规类) 或 'style' (如果是格式/术语类)，并在 reason 中明确指出违反了哪条规则：\n${customRules.map((r, i) => `${i+1}. ${r}`).join('\n')}\n`
    : "";

  if (mode === 'sensitive') {
    // ---------------- SENSITIVE / COMPLIANCE MODE ----------------
    systemInstruction = `
      你是一名严格的内容安全与合规审核专家。你的**唯一任务**是审查文本中的违规内容和敏感词。
      
      【检查范围】
      1. **用户自定义敏感词库**：严格匹配并标记用户提供的违禁词。
      2. **广告法合规**：识别“国家级”、“最高级”、“第一”、“顶级”等绝对化商业宣传用语。
      3. **内容安全**：识别涉政、色情、暴力、赌博、迷信等违法违规内容。
      4. **歧视与仇恨言论**：识别针对特定群体的歧视性用语。
      
      【忽略项】
      - **忽略**所有的错别字、拼写错误（除非该错别字是为了规避敏感词审查，如“政Fu”）。
      - **忽略**所有的语法错误、标点错误。
      - **忽略**所有的文风润色建议。

      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      
      如果发现自定义规则库中的内容，请视为合规性要求进行检查：
      ${customRulesInstruction}

      请只返回 'sensitive' 类型的 Issue。除非原文全是乱码无法阅读，否则 'score' 评分应主要反映合规程度（100表示完全合规，分值越低违规越严重）。
      返回格式必须是 JSON。
    `;

  } else if (mode === 'professional') {
    // ---------------- PROFESSIONAL MODE ----------------
    systemInstruction = `
      你是一个基于业界顶尖开源项目（如 MacBERT, PyCorrector）标准的专业中文校对引擎，兼具**内容合规审核**与**写作风格润色**功能。
      你的目标是提供出版级的校对服务，确保内容符合中国互联网内容安全与广告法规范，并像 Grammarly 一样提供提升文采的建议。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${customRulesInstruction}
      请进行深度、严格的校对，重点关注以下三大领域：

      一、CSC (Chinese Spelling Correction) 核心问题：
      1. 音似错误（Homophones）：如“竟快”->“尽快”，“在再”不分，“帐号”vs“账号”等。
      2. 形似错误（Visual similarity）：如“末”vs“未”，“治”vs“冶”，“拆”vs“折”。
      3. 语法与逻辑（Grammar & Logic）：基于依存句法分析，严格找出成分缺失、搭配不当、语序混乱。
      4. 标点规范（Punctuation）：严格符合《标点符号用法》(GB/T 15834) 标准。
      5. 成语与惯用语误用：检查望文生义、褒贬误用等。

      二、内容合规与敏感词审查 (Compliance & Sensitivity)：
      1. **广告法违规词**：识别并标记绝对化用语，如“国家级”、“最高级”、“最佳”、“第一”、“顶级”、“极品”等违反《广告法》的词汇。
      2. **内容安全**：识别政治敏感、色情低俗、暴力恐怖、赌博诈骗、封建迷信等不合规内容。
      3. **歧视与仇恨言论**：识别涉及地域、性别、职业等的歧视性表达。

      三、文风与表达优化 (Style & Suggestions) - 类似 Grammarly 的高级建议：
      请**积极**提供此类建议，不要仅限于纠错。如果句子语法正确但表达平庸，请务必提供优化方案。
      1. **简洁性 (Conciseness)**：
         - 去除冗余叠加词（如“大约左右”、“凯旋归来”）。
         - 删除无意义的口头禅和填充词（如“其实”、“那么”在不必要时）。
         - 精简啰嗦的句式。
      2. **清晰度 (Clarity)**：
         - 将晦涩难懂、逻辑嵌套过深的长句拆分为短句。
         - 消除指代不明和歧义。
      3. **用词精准 (Vocabulary & Impact)**：
         - **拒绝平庸**：将平淡、泛泛的词汇（如“进行”、“使用”、“好”）替换为更有力、更精准的动词或形容词（如“开展”、“采用”、“卓越”）。
         - **避免重复**：识别并优化短距离内重复使用的词汇。
      4. **语气与正式度 (Tone)**：
         - 根据上下文统一文风。如果看似商务/公文/学术文档，请将口语化表达（如“搞定”、“超棒”）修改为正式书面语（如“完成”、“卓越”）。
      
      规则：
      - 哪怕是极细微的错误也要指出。
      - 对于“敏感/合规”问题，类型标记为 'sensitive'，并给出具体的法律或合规修改建议（例如将“世界第一”改为“行业领先”）。
      - 对于“文风/表达优化”问题，类型标记为 'style' (风格) 或 'suggestion' (建议)。请积极提供这方面的修改，不要保守。
      - 保持原文的专业术语，不要过度修改风格，除非那是明显的病句、违规词或表达极差。
      - 如果是图片/PDF，先进行高精度 OCR 识别再校对。
      - 返回格式必须是 JSON。
    `;
  } else {
    // ---------------- FAST MODE ----------------
    systemInstruction = `
      你是一位资深的中文编辑和校对专家，同时熟悉内容合规标准。你的任务是快速检查用户提供的中文内容。
      ${whitelistInstruction}
      ${sensitiveWordsInstruction}
      ${customRulesInstruction}
      请找出：
      1. 错别字、语法错误、标点符号误用。
      2. **敏感词与合规问题**：包括广告法禁用词（如“最好”、“第一”）、低俗内容或敏感话题。
      3. **深度润色建议** (Style & Suggestion)：
         - 请像 Grammarly 一样，积极找出可以写得更好的地方。
         - 如果句子啰嗦，建议更简洁的写法。
         - 如果用词平淡，建议更精准的高级词汇。
      
      请遵循以下规则：
      1. 保持原意：修改后的文本应忠实于原意。
      2. 适当润色：可以对语句进行微调使其更通顺，标记为 'style' 或 'suggestion'。
      3. 评分：给原文打分（0-100）。
    `;
  }

  // Common JSON schema instruction appended
  systemInstruction += `
    \n请将发现的问题分类为：
       - sensitive (敏感/合规/广告法违禁词/违反自定义规则)
       - typo (错别字/音似/形似)
       - grammar (语病/语法错误)
       - punctuation (标点符号)
       - style (文风/冗余/清晰度/违反自定义术语规范)
       - suggestion (用词优化/更好的表达)
  `;

  try {
    const resultStream = await ai.models.generateContentStream({
      model,
      contents: typeof content === 'string' ? { parts: [{ text: content }] } : { parts: content },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correctedText: {
              type: Type.STRING,
              description: "The full text after all corrections have been applied.",
            },
            issues: {
              type: Type.ARRAY,
              description: "A list of specific issues found in the text.",
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING, description: "The problematic segment in the original text." },
                  suggestion: { type: Type.STRING, description: "The corrected segment." },
                  reason: { type: Type.STRING, description: "Explanation of why this is an error or suggestion." },
                  type: { 
                    type: Type.STRING, 
                    enum: [
                      IssueType.TYPO, 
                      IssueType.GRAMMAR, 
                      IssueType.PUNCTUATION, 
                      IssueType.STYLE,
                      IssueType.SUGGESTION,
                      IssueType.SENSITIVE
                    ] 
                  },
                },
                required: ["original", "suggestion", "reason", "type"],
              },
            },
            summary: {
              type: Type.STRING,
              description: "A one-sentence summary of the text quality and main issues.",
            },
            score: {
              type: Type.NUMBER,
              description: "A score from 0 to 100 rating the original text quality.",
            },
          },
          required: ["correctedText", "summary", "score", "issues"],
          // Enforce ordering to ensure text comes first for better streaming experience
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
          // Only trigger update if we have at least some text
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

    if (!fullText) {
      throw new Error("Empty response from Gemini");
    }

    // Clean any markdown backticks from the final result
    const cleanJson = fullText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanJson) as ProofreadResult;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};