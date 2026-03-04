package com.grammarzen.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    
    @PostMapping("/login")
    public ResponseEntity<Map<String, String>> login(@RequestBody Map<String, String> credentials) {
        // 实现登录逻辑
        return ResponseEntity.ok(Map.of("token", "mock-token"));
    }
    
    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(@RequestBody Map<String, String> userData) {
        // 实现注册逻辑
        return ResponseEntity.ok(Map.of("message", "User registered successfully"));
    }
    
    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refreshToken(@RequestBody Map<String, String> refreshToken) {
        // 实现令牌刷新逻辑
        return ResponseEntity.ok(Map.of("token", "mock-token"));
    }
    
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout() {
        // 实现登出逻辑
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }
}