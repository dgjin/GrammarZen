package com.grammarzen.controller;

import com.grammarzen.model.CollaborationSession;
import com.grammarzen.model.CollaborationMessage;
import com.grammarzen.service.CollaborationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/collaboration")
public class CollaborationController {
    
    @Autowired
    private CollaborationService collaborationService;
    
    @PostMapping("/sessions")
    public ResponseEntity<CollaborationSession> createSession(@RequestBody CollaborationSession session) {
        return ResponseEntity.ok(collaborationService.createSession(session));
    }
    
    @GetMapping("/sessions")
    public ResponseEntity<List<CollaborationSession>> getUserSessions() {
        return ResponseEntity.ok(collaborationService.getUserSessions());
    }
    
    @GetMapping("/sessions/{id}")
    public ResponseEntity<CollaborationSession> getSessionById(@PathVariable Long id) {
        return ResponseEntity.ok(collaborationService.getSessionById(id));
    }
    
    @PutMapping("/sessions/{id}")
    public ResponseEntity<CollaborationSession> updateSession(@PathVariable Long id, @RequestBody CollaborationSession session) {
        session.setId(id);
        return ResponseEntity.ok(collaborationService.updateSession(session));
    }
    
    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Void> deleteSession(@PathVariable Long id) {
        collaborationService.deleteSession(id);
        return ResponseEntity.noContent().build();
    }
    
    @PostMapping("/sessions/{id}/messages")
    public ResponseEntity<CollaborationMessage> addMessage(@PathVariable Long id, @RequestBody CollaborationMessage message) {
        return ResponseEntity.ok(collaborationService.addMessage(id, message));
    }
    
    @GetMapping("/sessions/{id}/messages")
    public ResponseEntity<List<CollaborationMessage>> getSessionMessages(@PathVariable Long id) {
        return ResponseEntity.ok(collaborationService.getSessionMessages(id));
    }
    
    @PostMapping("/sessions/{id}/join")
    public ResponseEntity<CollaborationSession> joinSession(@PathVariable Long id) {
        return ResponseEntity.ok(collaborationService.joinSession(id));
    }
    
    @PostMapping("/sessions/{id}/leave")
    public ResponseEntity<CollaborationSession> leaveSession(@PathVariable Long id) {
        return ResponseEntity.ok(collaborationService.leaveSession(id));
    }
}