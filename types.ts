export enum IssueType {
  TYPO = 'typo',
  GRAMMAR = 'grammar',
  PUNCTUATION = 'punctuation',
  STYLE = 'style',
  SUGGESTION = 'suggestion',
  SENSITIVE = 'sensitive', // For compliance/political/ad-law
  PRIVACY = 'privacy',     // For PII (Phone, ID, Address, etc.)
  FORMAT = 'format'        // For Fonts, Layout, Spacing, Margins
}

export interface Issue {
  original: string;
  suggestion: string;
  reason: string;
  type: IssueType;
  index?: number; // Approximate index for potential highlighting logic (simplified for now)
}

export interface ProofreadResult {
  correctedText: string;
  summary: string;
  score: number; // 0 to 100 score of the original text
  issues: Issue[];
}

export interface RuleLibrary {
  id: string;
  name: string;
  description: string;
  rules: string[]; // List of specific rules extracted by AI
  createdAt: number;
}

export interface HistoryRecord {
  id: string;
  originalText?: string;
  fileName?: string;
  fileType?: string;
  checkMode: string;
  summary: string;
  score: number;
  resultJson: ProofreadResult;
  createdAt: string; // ISO string from DB
}

export type LoadingState = 'idle' | 'loading' | 'streaming' | 'success' | 'error';