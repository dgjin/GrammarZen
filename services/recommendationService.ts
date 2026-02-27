import { Recommendation, HistoryRecord, Issue } from '../types';

// 行业模板推荐数据
const industryTemplates = [
  {
    industry: 'academic',
    title: '学术论文模板',
    description: '适用于学术论文、研究报告的专业校对',
    score: 90
  },
  {
    industry: 'technical',
    title: '技术文档模板',
    description: '适用于技术手册、API文档的专业校对',
    score: 85
  },
  {
    industry: 'business',
    title: '商务文档模板',
    description: '适用于商务邮件、合同文件的专业校对',
    score: 88
  },
  {
    industry: 'legal',
    title: '法律文书模板',
    description: '适用于法律文件、合同条款的专业校对',
    score: 92
  },
  {
    industry: 'social',
    title: '社交媒体模板',
    description: '适用于社交媒体、营销文案的专业校对',
    score: 82
  }
];

// 检查模式推荐数据
const modeRecommendations = [
  {
    mode: 'professional',
    title: '深度校对模式',
    description: '全面检查语法、拼写、标点和风格问题',
    score: 95
  },
  {
    mode: 'sensitive',
    title: '合规检查模式',
    description: '检查敏感词、隐私信息和广告法合规',
    score: 90
  },
  {
    mode: 'polishing',
    title: '智能润色模式',
    description: '提升文采，优化句式，保持原意',
    score: 88
  },
  {
    mode: 'format',
    title: '格式分析模式',
    description: '检查排版、字体、间距和格式规范',
    score: 85
  }
];

// 文本建议模板
const textSuggestions = [
  {
    title: '提升专业度',
    description: '使用更专业的词汇和句式',
    content: '建议使用更正式的表达方式，避免口语化用词，提升文本的专业感。'
  },
  {
    title: '增强逻辑结构',
    description: '优化段落结构和逻辑关系',
    content: '建议调整段落顺序，使用明确的过渡词，增强文本的逻辑性和可读性。'
  },
  {
    title: '改善表达方式',
    description: '使用更简洁明了的表达',
    content: '建议简化复杂句式，使用更直接的表达方式，提高文本的易懂性。'
  }
];

/**
 * 生成唯一ID
 */
const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

/**
 * 分析用户历史记录，提取模式
 */
const analyzeUserHistory = (history: HistoryRecord[]): {
  preferredModes: Record<string, number>;
  preferredIndustries: Record<string, number>;
  commonIssues: Record<string, number>;
} => {
  const preferredModes: Record<string, number> = {};
  const preferredIndustries: Record<string, number> = {};
  const commonIssues: Record<string, number> = {};

  history.forEach(record => {
    // 分析首选模式
    if (record.checkMode) {
      preferredModes[record.checkMode] = (preferredModes[record.checkMode] || 0) + 1;
    }

    // 分析常见问题类型
    record.resultJson.issues.forEach((issue: Issue) => {
      commonIssues[issue.type] = (commonIssues[issue.type] || 0) + 1;
    });
  });

  return {
    preferredModes,
    preferredIndustries,
    commonIssues
  };
};

/**
 * 基于文本内容分析推荐
 */
const analyzeTextContent = (text: string): {
  suggestedIndustry: string | null;
  suggestedMode: string | null;
  contentScore: number;
} => {
  // 简单的文本分析逻辑
  const textLower = text.toLowerCase();
  let suggestedIndustry: string | null = null;
  let suggestedMode: string | null = null;
  let contentScore = 70; // 默认分数

  // 基于关键词分析行业
  if (textLower.includes('论文') || textLower.includes('研究') || textLower.includes('学术')) {
    suggestedIndustry = 'academic';
  } else if (textLower.includes('技术') || textLower.includes('API') || textLower.includes('文档')) {
    suggestedIndustry = 'technical';
  } else if (textLower.includes('商务') || textLower.includes('合同') || textLower.includes('邮件')) {
    suggestedIndustry = 'business';
  } else if (textLower.includes('法律') || textLower.includes('条款') || textLower.includes('法规')) {
    suggestedIndustry = 'legal';
  } else if (textLower.includes('社交') || textLower.includes('营销') || textLower.includes('推广')) {
    suggestedIndustry = 'social';
  }

  // 基于文本长度和复杂度分析模式
  const wordCount = text.length;
  if (wordCount > 1000) {
    suggestedMode = 'professional';
  } else if (wordCount > 500) {
    suggestedMode = 'polishing';
  } else {
    suggestedMode = 'fast';
  }

  // 基于文本质量的简单评分
  if (text.includes('的') && text.includes('地') && text.includes('得')) {
    contentScore += 5;
  }
  if (text.includes('，') && text.includes('。') && text.includes('！')) {
    contentScore += 5;
  }
  if (text.length > 500) {
    contentScore += 5;
  }

  return {
    suggestedIndustry,
    suggestedMode,
    contentScore
  };
};

/**
 * 获取智能推荐
 */
export const getRecommendations = (
  text: string = '',
  history: HistoryRecord[] = []
): Recommendation[] => {
  const recommendations: Recommendation[] = [];

  // 分析用户历史
  const historyAnalysis = analyzeUserHistory(history);
  
  // 分析文本内容
  const textAnalysis = analyzeTextContent(text);

  // 推荐行业模板
  if (textAnalysis.suggestedIndustry) {
    const industryTemplate = industryTemplates.find(t => t.industry === textAnalysis.suggestedIndustry);
    if (industryTemplate) {
      recommendations.push({
        id: generateId(),
        type: 'industry',
        title: industryTemplate.title,
        description: industryTemplate.description,
        industry: industryTemplate.industry,
        score: industryTemplate.score
      });
    }
  } else {
    // 推荐评分最高的行业模板
    const topIndustry = industryTemplates.sort((a, b) => b.score - a.score)[0];
    recommendations.push({
      id: generateId(),
      type: 'industry',
      title: topIndustry.title,
      description: topIndustry.description,
      industry: topIndustry.industry,
      score: topIndustry.score
    });
  }

  // 推荐检查模式
  if (textAnalysis.suggestedMode) {
    const modeRecommendation = modeRecommendations.find(m => m.mode === textAnalysis.suggestedMode);
    if (modeRecommendation) {
      recommendations.push({
        id: generateId(),
        type: 'mode',
        title: modeRecommendation.title,
        description: modeRecommendation.description,
        mode: modeRecommendation.mode,
        score: modeRecommendation.score
      });
    }
  } else {
    // 基于用户历史推荐模式
    const topMode = Object.entries(historyAnalysis.preferredModes)
      .sort((a, b) => b[1] - a[1])[0];
    if (topMode) {
      const modeRecommendation = modeRecommendations.find(m => m.mode === topMode[0]);
      if (modeRecommendation) {
        recommendations.push({
          id: generateId(),
          type: 'mode',
          title: modeRecommendation.title,
          description: modeRecommendation.description,
          mode: modeRecommendation.mode,
          score: modeRecommendation.score
        });
      }
    } else {
      // 推荐默认模式
      const defaultMode = modeRecommendations[0];
      recommendations.push({
        id: generateId(),
        type: 'mode',
        title: defaultMode.title,
        description: defaultMode.description,
        mode: defaultMode.mode,
        score: defaultMode.score
      });
    }
  }

  // 推荐文本建议
  if (text.length > 0) {
    // 基于文本长度选择建议
    const suggestionIndex = Math.min(Math.floor(text.length / 500), textSuggestions.length - 1);
    const suggestion = textSuggestions[suggestionIndex];
    recommendations.push({
      id: generateId(),
      type: 'suggestion',
      title: suggestion.title,
      description: suggestion.description,
      content: suggestion.content
    });
  }

  // 限制推荐数量
  return recommendations.slice(0, 3);
};

/**
 * 获取历史分析统计
 */
export const getHistoryStats = (history: HistoryRecord[]): {
  totalChecks: number;
  averageScore: number;
  mostCommonMode: string;
  mostCommonIssueType: string;
} => {
  if (history.length === 0) {
    return {
      totalChecks: 0,
      averageScore: 0,
      mostCommonMode: 'fast',
      mostCommonIssueType: 'typo'
    };
  }

  const totalChecks = history.length;
  const totalScore = history.reduce((sum, record) => sum + record.score, 0);
  const averageScore = Math.round(totalScore / totalChecks);

  // 计算最常见的模式
  const modeCounts: Record<string, number> = {};
  history.forEach(record => {
    modeCounts[record.checkMode] = (modeCounts[record.checkMode] || 0) + 1;
  });
  const mostCommonMode = Object.entries(modeCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  // 计算最常见的问题类型
  const issueCounts: Record<string, number> = {};
  history.forEach(record => {
    record.resultJson.issues.forEach((issue: Issue) => {
      issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
    });
  });
  const mostCommonIssueType = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'typo';

  return {
    totalChecks,
    averageScore,
    mostCommonMode,
    mostCommonIssueType
  };
};
