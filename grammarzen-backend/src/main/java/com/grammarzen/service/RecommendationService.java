package com.grammarzen.service;

import com.grammarzen.model.RecommendationData;
import com.grammarzen.model.User;
import com.grammarzen.repository.RecommendationDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;

@Service
public class RecommendationService {
    @Autowired
    private RecommendationDataRepository recommendationRepository;
    
    public List<RecommendationData> getRecommendationsByUser(User user) {
        return recommendationRepository.findByUser(user);
    }
    
    public List<RecommendationData> getRecommendationsByUserAndType(User user, String type) {
        return recommendationRepository.findByUserAndType(user, type);
    }
    
    public RecommendationData saveRecommendation(User user, String type, String data, int score) {
        RecommendationData recommendation = new RecommendationData();
        recommendation.setUser(user);
        recommendation.setType(type);
        recommendation.setData(data);
        recommendation.setScore(score);
        recommendation.setCreatedAt(new Date());
        return recommendationRepository.save(recommendation);
    }
    
    public void deleteRecommendation(Long id) {
        recommendationRepository.deleteById(id);
    }
    
    // 分析用户历史，提取模式
    public void analyzeUserHistory(User user) {
        // 实现用户历史分析逻辑
    }
    
    // 基于文本内容分析推荐
    public void analyzeTextContent(User user, String text) {
        // 实现文本内容分析逻辑
    }
}