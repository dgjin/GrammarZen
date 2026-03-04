import { CollaborationSession, CollaborationMessage, Issue } from '../types';

const API_BASE_URL = 'http://localhost:8080/api';

/**
 * 创建协作会话
 */
export const createCollaborationSession = async (
  name: string,
  creatorId: string,
  initialText: string
): Promise<CollaborationSession> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      name,
      creatorId,
      participants: [creatorId],
      document: {
        originalText: initialText,
        currentText: initialText,
        issues: []
      }
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to create collaboration session');
  }
  
  return response.json();
};

/**
 * 获取协作会话列表
 */
export const getCollaborationSessions = async (userId: string): Promise<CollaborationSession[]> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get collaboration sessions');
  }
  
  return response.json();
};

/**
 * 获取协作会话详情
 */
export const getCollaborationSession = async (sessionId: string): Promise<CollaborationSession | null> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions/${sessionId}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get collaboration session');
  }
  
  return response.json();
};

/**
 * 更新协作文档内容
 */
export const updateCollaborationDocument = async (
  sessionId: string,
  userId: string,
  newText: string,
  issues: Issue[] = []
): Promise<CollaborationSession | null> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions/${sessionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      document: {
        currentText: newText,
        issues: issues
      }
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to update collaboration document');
  }
  
  return response.json();
};

/**
 * 添加协作会话参与者
 */
export const addCollaborationParticipant = async (
  sessionId: string,
  userId: string
): Promise<CollaborationSession | null> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions/${sessionId}/join`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to add collaboration participant');
  }
  
  return response.json();
};

/**
 * 移除协作会话参与者
 */
export const removeCollaborationParticipant = async (
  sessionId: string,
  userId: string
): Promise<CollaborationSession | null> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions/${sessionId}/leave`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to remove collaboration participant');
  }
  
  return response.json();
};

/**
 * 发送协作消息
 */
export const addCollaborationMessage = async (
  message: Omit<CollaborationMessage, 'id' | 'createdAt'>
): Promise<CollaborationMessage> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions/${message.sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify(message)
  });
  
  if (!response.ok) {
    throw new Error('Failed to add collaboration message');
  }
  
  return response.json();
};

/**
 * 获取协作会话消息
 */
export const getCollaborationMessages = async (sessionId: string): Promise<CollaborationMessage[]> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions/${sessionId}/messages`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get collaboration messages');
  }
  
  return response.json();
};

/**
 * 删除协作会话
 */
export const deleteCollaborationSession = async (
  sessionId: string,
  userId: string
): Promise<boolean> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  return response.ok;
};

/**
 * 搜索协作会话
 */
export const searchCollaborationSessions = async (
  userId: string,
  query: string
): Promise<CollaborationSession[]> => {
  const response = await fetch(`${API_BASE_URL}/collaboration/sessions?search=${encodeURIComponent(query)}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to search collaboration sessions');
  }
  
  return response.json();
};
