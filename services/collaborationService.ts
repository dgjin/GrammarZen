import { CollaborationSession, CollaborationMessage, Issue } from '../types';

// 模拟协作会话存储
let collaborationSessions: CollaborationSession[] = [];
let collaborationMessages: CollaborationMessage[] = [];

/**
 * 生成唯一ID
 */
const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

/**
 * 创建协作会话
 */
export const createCollaborationSession = (
  name: string,
  creatorId: string,
  initialText: string
): CollaborationSession => {
  const session: CollaborationSession = {
    id: generateId(),
    name,
    creatorId,
    participants: [creatorId],
    document: {
      originalText: initialText,
      currentText: initialText,
      issues: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  collaborationSessions.push(session);
  return session;
};

/**
 * 获取协作会话列表
 */
export const getCollaborationSessions = (userId: string): CollaborationSession[] => {
  return collaborationSessions.filter(session => 
    session.participants.includes(userId)
  );
};

/**
 * 获取协作会话详情
 */
export const getCollaborationSession = (sessionId: string): CollaborationSession | null => {
  return collaborationSessions.find(session => session.id === sessionId) || null;
};

/**
 * 更新协作文档内容
 */
export const updateCollaborationDocument = (
  sessionId: string,
  userId: string,
  newText: string,
  issues: Issue[] = []
): CollaborationSession | null => {
  const session = collaborationSessions.find(s => s.id === sessionId);
  if (!session) return null;

  // 检查用户是否是会话参与者
  if (!session.participants.includes(userId)) return null;

  // 更新文档内容
  session.document.currentText = newText;
  session.document.issues = issues;
  session.updatedAt = new Date().toISOString();

  // 添加编辑消息
  addCollaborationMessage({
    sessionId,
    userId,
    userName: 'User', // 实际应用中应该从用户信息中获取
    content: '更新了文档内容',
    type: 'edit'
  });

  return session;
};

/**
 * 添加协作会话参与者
 */
export const addCollaborationParticipant = (
  sessionId: string,
  userId: string
): CollaborationSession | null => {
  const session = collaborationSessions.find(s => s.id === sessionId);
  if (!session) return null;

  // 检查用户是否已经是参与者
  if (session.participants.includes(userId)) return session;

  // 添加参与者
  session.participants.push(userId);
  session.updatedAt = new Date().toISOString();

  // 添加消息
  addCollaborationMessage({
    sessionId,
    userId,
    userName: 'User', // 实际应用中应该从用户信息中获取
    content: '加入了协作会话',
    type: 'message'
  });

  return session;
};

/**
 * 移除协作会话参与者
 */
export const removeCollaborationParticipant = (
  sessionId: string,
  userId: string
): CollaborationSession | null => {
  const session = collaborationSessions.find(s => s.id === sessionId);
  if (!session) return null;

  // 检查用户是否是会话参与者
  if (!session.participants.includes(userId)) return session;

  // 不能移除创建者
  if (session.creatorId === userId) return null;

  // 移除参与者
  session.participants = session.participants.filter(id => id !== userId);
  session.updatedAt = new Date().toISOString();

  // 添加消息
  addCollaborationMessage({
    sessionId,
    userId,
    userName: 'User', // 实际应用中应该从用户信息中获取
    content: '离开了协作会话',
    type: 'message'
  });

  return session;
};

/**
 * 发送协作消息
 */
export const addCollaborationMessage = (
  message: Omit<CollaborationMessage, 'id' | 'createdAt'>
): CollaborationMessage => {
  const newMessage: CollaborationMessage = {
    ...message,
    id: generateId(),
    createdAt: new Date().toISOString()
  };

  collaborationMessages.push(newMessage);
  return newMessage;
};

/**
 * 获取协作会话消息
 */
export const getCollaborationMessages = (sessionId: string): CollaborationMessage[] => {
  return collaborationMessages
    .filter(message => message.sessionId === sessionId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

/**
 * 删除协作会话
 */
export const deleteCollaborationSession = (
  sessionId: string,
  userId: string
): boolean => {
  const session = collaborationSessions.find(s => s.id === sessionId);
  if (!session) return false;

  // 只有创建者可以删除会话
  if (session.creatorId !== userId) return false;

  // 删除会话
  collaborationSessions = collaborationSessions.filter(s => s.id !== sessionId);
  
  // 删除相关消息
  collaborationMessages = collaborationMessages.filter(m => m.sessionId !== sessionId);

  return true;
};

/**
 * 搜索协作会话
 */
export const searchCollaborationSessions = (
  userId: string,
  query: string
): CollaborationSession[] => {
  return collaborationSessions.filter(session => 
    session.participants.includes(userId) &&
    session.name.toLowerCase().includes(query.toLowerCase())
  );
};
