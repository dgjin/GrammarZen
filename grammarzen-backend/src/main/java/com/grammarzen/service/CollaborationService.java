package com.grammarzen.service;

import com.grammarzen.model.CollaborationSession;
import com.grammarzen.model.CollaborationMessage;
import com.grammarzen.model.User;
import com.grammarzen.repository.CollaborationSessionRepository;
import com.grammarzen.repository.CollaborationMessageRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;
import java.util.Optional;

@Service
public class CollaborationService {
    @Autowired
    private CollaborationSessionRepository sessionRepository;
    
    @Autowired
    private CollaborationMessageRepository messageRepository;
    
    public CollaborationSession createSession(String name, User creator, String initialText) {
        CollaborationSession session = new CollaborationSession();
        session.setName(name);
        session.setCreator(creator);
        session.setDocument(initialText);
        session.setCreatedAt(new Date());
        session.setUpdatedAt(new Date());
        return sessionRepository.save(session);
    }
    
    public List<CollaborationSession> getSessionsByUser(User user) {
        return sessionRepository.findByParticipantsContaining(user);
    }
    
    public Optional<CollaborationSession> getSessionById(Long id) {
        return sessionRepository.findById(id);
    }
    
    public CollaborationSession updateSession(CollaborationSession session) {
        session.setUpdatedAt(new Date());
        return sessionRepository.save(session);
    }
    
    public void deleteSession(Long id) {
        sessionRepository.deleteById(id);
    }
    
    public CollaborationSession addParticipant(Long sessionId, User user) {
        Optional<CollaborationSession> optionalSession = sessionRepository.findById(sessionId);
        if (optionalSession.isPresent()) {
            CollaborationSession session = optionalSession.get();
            session.getParticipants().add(user);
            session.setUpdatedAt(new Date());
            return sessionRepository.save(session);
        }
        return null;
    }
    
    public CollaborationSession removeParticipant(Long sessionId, User user) {
        Optional<CollaborationSession> optionalSession = sessionRepository.findById(sessionId);
        if (optionalSession.isPresent()) {
            CollaborationSession session = optionalSession.get();
            session.getParticipants().remove(user);
            session.setUpdatedAt(new Date());
            return sessionRepository.save(session);
        }
        return null;
    }
    
    public CollaborationMessage addMessage(CollaborationSession session, User user, String content, String type) {
        CollaborationMessage message = new CollaborationMessage();
        message.setSession(session);
        message.setUser(user);
        message.setUserName(user.getNickname() != null ? user.getNickname() : user.getEmail());
        message.setContent(content);
        message.setType(type);
        message.setCreatedAt(new Date());
        return messageRepository.save(message);
    }
    
    public List<CollaborationMessage> getMessagesBySession(CollaborationSession session) {
        return messageRepository.findBySession(session);
    }
}