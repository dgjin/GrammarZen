/**
 * 文件分块处理工具函数
 */

// 分块大小（默认 1MB）
const CHUNK_SIZE = 1024 * 1024;

/**
 * 将文件分块
 * @param file 要分块的文件
 * @returns 分块数组
 */
export const chunkFile = (file: File): Blob[] => {
  const chunks: Blob[] = [];
  let start = 0;
  
  while (start < file.size) {
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    chunks.push(chunk);
    start = end;
  }
  
  return chunks;
};

/**
 * 读取文件块为Base64
 * @param chunk 文件块
 * @returns Promise<string> Base64编码的文件块
 */
export const readChunkAsBase64 = (chunk: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(chunk);
  });
};

/**
 * 合并Base64字符串
 * @param base64Chunks Base64编码的文件块数组
 * @returns 合并后的Base64字符串
 */
export const mergeBase64Chunks = (base64Chunks: string[]): string => {
  return base64Chunks.join('');
};

/**
 * 处理大文件（分块处理）
 * @param file 要处理的文件
 * @param onProgress 进度回调函数
 * @returns Promise<string> 处理后的Base64字符串
 */
export const processLargeFile = async (
  file: File, 
  onProgress?: (progress: number) => void
): Promise<string> => {
  const chunks = chunkFile(file);
  const base64Chunks: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const base64Data = await readChunkAsBase64(chunk);
    base64Chunks.push(base64Data);
    
    if (onProgress) {
      const progress = Math.round(((i + 1) / chunks.length) * 100);
      onProgress(progress);
    }
  }
  
  return mergeBase64Chunks(base64Chunks);
};

/**
 * 计算文件大小的可读格式
 * @param bytes 文件大小（字节）
 * @returns 可读的文件大小字符串
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
