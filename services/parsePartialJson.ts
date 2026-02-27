import { ProofreadResult, Issue } from '../types';

/**
 * Helper to extract partial data from incomplete JSON string with improved error handling
 */
export const parsePartialJson = (json: string): Partial<ProofreadResult> => {
  const result: Partial<ProofreadResult> = {};
  
  // Clean markdown code blocks if present
  let cleanJson = json.replace(/^```json\s*/, '').replace(/\s*```$/, '');

  // 1. Extract correctedText with better handling of incomplete JSON
  const textMatch = cleanJson.match(/"correctedText"\s*:\s*"(.*?)(?:(?<!\\)"|$)/s);
  if (textMatch) {
    let rawText = textMatch[1];
    try {
      // Handle escaped quotes and backslashes
      result.correctedText = rawText
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
      
      // If the string is truncated (ends with backslash), remove it to avoid display issues
      if (result.correctedText.endsWith('\\') && !result.correctedText.endsWith('\\\\')) {
        result.correctedText = result.correctedText.slice(0, -1);
      }
    } catch (e) {
      result.correctedText = rawText;
    }
  }

  // 2. Extract Issues with better error handling
  const issuesMatch = cleanJson.match(/"issues"\s*:\s*\[(.*)/s);
  if (issuesMatch) {
    const content = issuesMatch[1];
    const issues: Issue[] = [];
    
    // More robust object matching that handles nested braces better
    let braceCount = 0;
    let startIndex = 0;
    
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') braceCount++;
      if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex < i) {
          const objStr = content.substring(startIndex, i + 1);
          try {
            const obj = JSON.parse(objStr);
            if (obj.original && obj.suggestion && obj.type) {
              issues.push(obj);
            }
          } catch (e) {
            // Ignore incomplete objects
          }
          startIndex = i + 1;
        }
      }
    }
    
    if (issues.length > 0) {
      result.issues = issues;
    }
  }

  // 3. Extract Summary & Score (Best effort)
  const summaryMatch = cleanJson.match(/"summary"\s*:\s*"(.*?)(?:(?<!\\)"|$)/s);
  if (summaryMatch) {
    result.summary = summaryMatch[1].replace(/\\"/g, '"');
  }

  const scoreMatch = cleanJson.match(/"score"\s*:\s*(\d+)/);
  if (scoreMatch) {
    result.score = parseInt(scoreMatch[1], 10);
  }

  return result;
};