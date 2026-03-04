package com.grammarzen.repository;

import com.grammarzen.model.CollaborationMessage;
import com.grammarzen.model.CollaborationSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CollaborationMessageRepository extends JpaRepository<CollaborationMessage, Long> {
    List<CollaborationMessage> findBySession(CollaborationSession session);
}