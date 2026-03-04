package com.grammarzen.controller;

import com.grammarzen.model.RecommendationData;
import com.grammarzen.service.RecommendationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/recommendations")
public class RecommendationController {
    
    @Autowired
    private RecommendationService recommendationService;
    
    @GetMapping
    public ResponseEntity<List<RecommendationData>> getUserRecommendations() {
        return ResponseEntity.ok(recommendationService.getUserRecommendations());
    }
    
    @PostMapping
    public ResponseEntity<RecommendationData> saveRecommendation(@RequestBody RecommendationData recommendation) {
        return ResponseEntity.ok(recommendationService.saveRecommendation(recommendation));
    }
    
    @GetMapping("/type/{type}")
    public ResponseEntity<List<RecommendationData>> getRecommendationsByType(@PathVariable String type) {
        return ResponseEntity.ok(recommendationService.getRecommendationsByType(type));
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRecommendation(@PathVariable Long id) {
        recommendationService.deleteRecommendation(id);
        return ResponseEntity.noContent().build();
    }
    
    @PostMapping("/analyze")
    public ResponseEntity<List<RecommendationData>> analyzeText(@RequestBody String text) {
        return ResponseEntity.ok(recommendationService.analyzeText(text));
    }
}