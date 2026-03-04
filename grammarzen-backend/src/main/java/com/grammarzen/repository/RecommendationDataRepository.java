package com.grammarzen.repository;

import com.grammarzen.model.RecommendationData;
import com.grammarzen.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RecommendationDataRepository extends JpaRepository<RecommendationData, Long> {
    List<RecommendationData> findByUser(User user);
    List<RecommendationData> findByUserAndType(User user, String type);
}