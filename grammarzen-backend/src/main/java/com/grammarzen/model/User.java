package com.grammarzen.model;

import javax.persistence.*;
import java.util.Set;

@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(unique = true, nullable = false)
    private String email;
    
    @Column(nullable = false)
    private String password;
    
    private String nickname;
    private String avatarUrl;
    
    @OneToMany(mappedBy = "creator", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private Set<CollaborationSession> createdSessions;
    
    @ManyToMany(mappedBy = "participants")
    private Set<CollaborationSession> participatedSessions;
    
    // Getters and Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getEmail() {
        return email;
    }
    
    public void setEmail(String email) {
        this.email = email;
    }
    
    public String getPassword() {
        return password;
    }
    
    public void setPassword(String password) {
        this.password = password;
    }
    
    public String getNickname() {
        return nickname;
    }
    
    public void setNickname(String nickname) {
        this.nickname = nickname;
    }
    
    public String getAvatarUrl() {
        return avatarUrl;
    }
    
    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }
    
    public Set<CollaborationSession> getCreatedSessions() {
        return createdSessions;
    }
    
    public void setCreatedSessions(Set<CollaborationSession> createdSessions) {
        this.createdSessions = createdSessions;
    }
    
    public Set<CollaborationSession> getParticipatedSessions() {
        return participatedSessions;
    }
    
    public void setParticipatedSessions(Set<CollaborationSession> participatedSessions) {
        this.participatedSessions = participatedSessions;
    }
}