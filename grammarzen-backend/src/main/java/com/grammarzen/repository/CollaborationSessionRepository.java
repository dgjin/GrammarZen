package com.grammarzen.repository;

import com.grammarzen.model.CollaborationSession;
import com.grammarzen.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CollaborationSessionRepository extends JpaRepository<CollaborationSession, Long> {
    List<CollaborationSession> findByCreator(User creator);
    List<CollaborationSession> findByParticipantsContaining(User user);
}