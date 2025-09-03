// =============================================
// USER PROFILE & CALORIE CALCULATION APIs
// =============================================

// Save user profile and calculate daily calorie target
app.post('/api/user/profile', (req, res) => {
  console.log('👤 RENDER: User profile creation requested');
  
  try {
    const { goal, age, gender, height, weight, activityLevel } = req.body;
    
    // Validate required fields
    if (!goal || !age || !gender || !height || !weight || !activityLevel) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: goal, age, gender, height, weight, activityLevel'
      });
    }
    
    console.log('👤 RENDER: Profile data received:', { goal, age, gender, height, weight, activityLevel });
    
    // Calculate BMR (Basal Metabolic Rate)
    let bmr;
    if (gender.toLowerCase() === 'male') {
      bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else {
      bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    }
    
    // Activity level multipliers
    const activityMultipliers = {
      'sedentary': 1.2,      // Little or no exercise
      'light': 1.375,        // Light exercise 1-3 days/week
      'moderate': 1.55,      // Moderate exercise 3-5 days/week
      'active': 1.725,       // Hard exercise 6-7 days/week
      'very_active': 1.9     // Very hard exercise, physical job
    };
    
    // Calculate TDEE (Total Daily Energy Expenditure)
    const activityMultiplier = activityMultipliers[activityLevel] || 1.55;
    const tdee = Math.round(bmr * activityMultiplier);
    
    // Adjust calories based on goal
    let dailyCalorieTarget;
    let recommendedMacros;
    
    switch (goal.toLowerCase()) {
      case 'weight_loss':
        dailyCalorieTarget = Math.round(tdee - 500); // 500 cal deficit for 1lb/week loss
        recommendedMacros = {
          protein: Math.round(weight * 2.2), // 1g per lb body weight
          carbs: Math.round((dailyCalorieTarget * 0.40) / 4), // 40% carbs
          fat: Math.round((dailyCalorieTarget * 0.25) / 9)    // 25% fat
        };
        break;
        
      case 'muscle_gain':
        dailyCalorieTarget = Math.round(tdee + 300); // 300 cal surplus
        recommendedMacros = {
          protein: Math.round(weight * 2.4), // 1.1g per lb body weight  
          carbs: Math.round((dailyCalorieTarget * 0.45) / 4), // 45% carbs
          fat: Math.round((dailyCalorieTarget * 0.25) / 9)    // 25% fat
        };
        break;
        
      case 'maintain':
      default:
        dailyCalorieTarget = tdee;
        recommendedMacros = {
          protein: Math.round(weight * 2.0), // 0.9g per lb body weight
          carbs: Math.round((dailyCalorieTarget * 0.45) / 4), // 45% carbs
          fat: Math.round((dailyCalorieTarget * 0.30) / 9)    // 30% fat
        };
        break;
    }
    
    const userProfile = {
      goal,
      age: Number(age),
      gender,
      height: Number(height),
      weight: Number(weight),
      activityLevel,
      bmr: Math.round(bmr),
      tdee,
      dailyCalorieTarget,
      recommendedMacros,
      createdAt: new Date().toISOString()
    };
    
    console.log('✅ RENDER: Profile calculated successfully:', userProfile);
    
    res.json({
      success: true,
      data: userProfile,
      message: `Daily target: ${dailyCalorieTarget} calories for ${goal.replace('_', ' ')}`
    });
    
  } catch (error) {
    console.error('❌ RENDER: Profile calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate user profile: ' + error.message
    });
  }
});

// Get daily progress and recommendations
app.post('/api/user/dashboard', (req, res) => {
  console.log('📊 RENDER: Dashboard data requested');
  
  try {
    const { userProfile, todaysMeals = [] } = req.body;
    
    if (!userProfile) {
      return res.status(400).json({
        success: false,
        error: 'User profile required'
      });
    }
    
    // Calculate today's totals
    const todaysTotals = todaysMeals.reduce((totals, meal) => {
      const portion = meal.portionSize || 1;
      return {
        calories: totals.calories + (meal.calories * portion),
        protein: totals.protein + (meal.protein * portion),
        carbs: totals.carbs + (meal.carbs * portion),
        fat: totals.fat + (meal.fat * portion),
        fiber: totals.fiber + ((meal.fiber || 0) * portion)
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    
    // Calculate progress percentages
    const progress = {
      calories: Math.round((todaysTotals.calories / userProfile.dailyCalorieTarget) * 100),
      protein: Math.round((todaysTotals.protein / userProfile.recommendedMacros.protein) * 100),
      carbs: Math.round((todaysTotals.carbs / userProfile.recommendedMacros.carbs) * 100),
      fat: Math.round((todaysTotals.fat / userProfile.recommendedMacros.fat) * 100)
    };
    
    // Generate smart recommendations
    let recommendations = [];
    const remaining = {
      calories: userProfile.dailyCalorieTarget - todaysTotals.calories,
      protein: userProfile.recommendedMacros.protein - todaysTotals.protein,
      carbs: userProfile.recommendedMacros.carbs - todaysTotals.carbs,
      fat: userProfile.recommendedMacros.fat - todaysTotals.fat
    };
    
    // Goal-specific recommendations
    if (userProfile.goal === 'weight_loss') {
      if (progress.calories > 90) {
        recommendations.push("Great! You're close to your calorie target for weight loss.");
      } else if (remaining.calories > 300) {
        recommendations.push("You have room for a healthy snack. Try fruits or nuts.");
      }
    } else if (userProfile.goal === 'muscle_gain') {
      if (remaining.protein > 15) {
        recommendations.push("Add more protein! Try dal, paneer, or chicken for muscle growth.");
      }
      if (remaining.calories > 200) {
        recommendations.push("You need more calories for muscle gain. Add healthy carbs like rice or roti.");
      }
    } else { // maintain
      if (Math.abs(remaining.calories) < 100) {
        recommendations.push("Perfect balance! You're maintaining well.");
      }
    }
    
    // Macro-specific recommendations  
    if (remaining.protein > 20) {
      recommendations.push("Low protein today. Consider adding dal, eggs, or Greek yogurt.");
    }
    if (remaining.carbs > 30) {
      recommendations.push("Add some healthy carbs like brown rice, quinoa, or fruits.");
    }
    
    const dashboardData = {
      todaysTotals: {
        calories: Math.round(todaysTotals.calories),
        protein: Math.round(todaysTotals.protein * 10) / 10,
        carbs: Math.round(todaysTotals.carbs * 10) / 10,
        fat: Math.round(todaysTotals.fat * 10) / 10,
        fiber: Math.round(todaysTotals.fiber * 10) / 10
      },
      targets: {
        calories: userProfile.dailyCalorieTarget,
        protein: userProfile.recommendedMacros.protein,
        carbs: userProfile.recommendedMacros.carbs,
        fat: userProfile.recommendedMacros.fat
      },
      remaining: {
        calories: Math.round(remaining.calories),
        protein: Math.round(remaining.protein * 10) / 10,
        carbs: Math.round(remaining.carbs * 10) / 10,
        fat: Math.round(remaining.fat * 10) / 10
      },
      progress,
      recommendations: recommendations.slice(0, 2), // Limit to 2 recommendations
      mealCount: todaysMeals.length,
      lastUpdated: new Date().toISOString()
    };
    
    console.log('✅ RENDER: Dashboard data calculated:', dashboardData);
    
    res.json({
      success: true,
      data: dashboardData
    });
    
  } catch (error) {
    console.error('❌ RENDER: Dashboard calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate dashboard data: ' + error.message
    });
  }
});

// Simple calorie calculation endpoint (alternative method)
app.post('/api/calculate-target', (req, res) => {
  console.log('🎯 RENDER: Simple target calculation requested');
  
  try {
    const { goal, age, gender, height, weight, activityLevel } = req.body;
    
    // Simplified calculation for quick testing
    const baseCalories = gender.toLowerCase() === 'male' ? 2000 : 1800;
    const activityBonus = activityLevel === 'active' ? 300 : activityLevel === 'sedentary' ? -200 : 0;
    const ageAdjustment = age > 40 ? -100 : age < 25 ? 100 : 0;
    
    let targetCalories = baseCalories + activityBonus + ageAdjustment;
    
    // Goal adjustments
    if (goal === 'weight_loss') targetCalories -= 500;
    if (goal === 'muscle_gain') targetCalories += 300;
    
    res.json({
      success: true,
      data: {
        dailyCalorieTarget: targetCalories,
        goal,
        message: `Target: ${targetCalories} calories for ${goal.replace('_', ' ')}`
      }
    });
    
  } catch (error) {
    console.error('❌ RENDER: Target calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'Calculation failed: ' + error.message
    });
  }
});
