
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
let genAI = null;
let model = null;
let geminiConnected = false;

try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    geminiConnected = true;
    console.log('✅ RENDER: Gemini AI initialized successfully');
  } else {
    console.log('❌ RENDER: GEMINI_API_KEY not found in environment variables');
  }
} catch (error) {
  console.error('❌ RENDER: Failed to initialize Gemini AI:', error.message);
  geminiConnected = false;
}

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-flutter-app-domain.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Accept', 'User-Agent']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`🔍 RENDER: ${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log(`🔍 RENDER: Headers:`, req.headers);
  next();
});

// =============================================
// NEW USER PROFILE & CALORIE CALCULATION APIs
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

// Simple calorie calculation endpoint
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

// =============================================
// EXISTING ENDPOINTS (KEEP THESE)
// =============================================

// Health check endpoint
app.get('/', (req, res) => {
  console.log('🏥 RENDER: Health check requested');
  
  const healthData = {
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    geminiConnected: geminiConnected,
    apiKeyPresent: !!process.env.GEMINI_API_KEY,
    endpoints: {
      health: '/',
      analyzeFood: '/api/analyze-food-base64',
      userProfile: '/api/user/profile',
      dashboard: '/api/user/dashboard',
      calculateTarget: '/api/calculate-target'
    }
  };
  
  console.log('🏥 RENDER: Health data:', healthData);
  res.json(healthData);
});

// Test simple endpoint
app.post('/api/test-simple', (req, res) => {
  console.log('🧪 RENDER: Simple test requested');
  console.log('🧪 RENDER: Test data received:', req.body);
  
  res.json({
    success: true,
    message: 'Simple test successful',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// Base64 endpoint test
app.get('/api/analyze-food-base64', (req, res) => {
  console.log('🧪 RENDER: Base64 endpoint GET test');
  
  res.json({
    success: true,
    message: 'Base64 endpoint is ready',
    method: 'Use POST to send base64 image data',
    expectedFormat: {
      image: 'base64_string_here',
      mimeType: 'image/jpeg'
    }
  });
});

// Main food analysis endpoint
app.post('/api/analyze-food-base64', async (req, res) => {
  console.log('🍎 RENDER: Food analysis requested');
  
  try {
    // Check Gemini connection
    if (!geminiConnected || !model) {
      console.log('❌ RENDER: Gemini AI not connected');
      return res.status(500).json({
        success: false,
        error: 'AI service not available - API key missing or invalid'
      });
    }
    
    // Validate request body
    const { image, mimeType } = req.body;
    
    if (!image) {
      console.log('❌ RENDER: No image data received');
      return res.status(400).json({
        success: false,
        error: 'No image data provided'
      });
    }
    
    console.log('🔍 RENDER: Image data received');
    console.log('🔍 RENDER: Image length:', image.length);
    console.log('🔍 RENDER: MIME type:', mimeType || 'image/jpeg');
    
    // Prepare Gemini prompt for Indian food analysis
    const prompt = `Analyze this Indian food image and provide detailed nutritional information. 

    Please provide:
    1. Food name (in English, identify the specific Indian dish)
    2. Estimated calories per serving
    3. Protein content (grams)
    4. Carbohydrates (grams)
    5. Fat content (grams)
    6. Fiber content (grams)
    7. Typical portion size
    8. Brief description
    9. Confidence level (0.0 to 1.0)
    
    Format your response as a JSON object with these exact keys:
    {
      "foodName": "Dal Rice",
      "calories": 350,
      "protein": 15.2,
      "carbs": 65.0,
      "fat": 8.5,
      "fiber": 6.0,
      "portionSize": "1 serving (200g)",
      "description": "Traditional Indian lentil curry with rice",
      "confidence": 0.85
    }
    
    If you cannot identify the food clearly, set confidence below 0.5 and provide your best estimate.`;
    
    console.log('🤖 RENDER: Sending request to Gemini AI...');
    
    // Call Gemini Vision API
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: image
        }
      }
    ]);
    
    const responseText = result.response.text();
    console.log('🤖 RENDER: Gemini raw response:', responseText);
    
    // Parse JSON from Gemini response
    let foodData;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      foodData = JSON.parse(jsonString);
      console.log('✅ RENDER: Successfully parsed food data:', foodData);
    } catch (parseError) {
      console.log('❌ RENDER: Failed to parse Gemini JSON, creating fallback');
      
      // Fallback parsing if JSON is malformed
      foodData = {
        foodName: "Indian Food Item",
        calories: 300,
        protein: 12.0,
        carbs: 45.0,
        fat: 8.0,
        fiber: 5.0,
        portionSize: "1 serving",
        description: "AI analysis completed but response format needs adjustment",
        confidence: 0.6
      };
    }
    
    // Validate and sanitize data
    const sanitizedData = {
      foodName: foodData.foodName || "Unknown Indian Food",
      calories: Number(foodData.calories) || 300,
      protein: Number(foodData.protein) || 12.0,
      carbs: Number(foodData.carbs) || 45.0,
      fat: Number(foodData.fat) || 8.0,
      fiber: Number(foodData.fiber) || 5.0,
      portionSize: foodData.portionSize || "1 serving",
      description: foodData.description || "AI analyzed Indian food",
      confidence: Number(foodData.confidence) || 0.7
    };
    
    console.log('✅ RENDER: Final sanitized data:', sanitizedData);
    
    // Send response
    res.json({
      success: true,
      data: sanitizedData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ RENDER: Analysis error:', error);
    
    // Handle different types of errors
    if (error.message.includes('API key')) {
      res.status(401).json({
        success: false,
        error: 'API authentication failed'
      });
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      res.status(429).json({
        success: false,
        error: 'API quota exceeded, please try again later'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'AI analysis failed: ' + error.message
      });
    }
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 RENDER: Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`❌ RENDER: Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: ['/', '/api/analyze-food-base64', '/api/test-simple', '/api/user/profile', '/api/user/dashboard', '/api/calculate-target']
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 RENDER: Server running on port ${PORT}`);
  console.log(`🚀 RENDER: Health check: http://localhost:${PORT}/`);
  console.log(`🚀 RENDER: Gemini connected: ${geminiConnected}`);
  console.log(`🚀 RENDER: Ready to analyze Indian food! 🍛`);
  console.log(`🚀 RENDER: New APIs: Profile, Dashboard, Calculate Target! 💪`);
});
