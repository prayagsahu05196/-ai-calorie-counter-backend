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
      analyzeFood: '/api/analyze-food-base64'
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
    availableEndpoints: ['/', '/api/analyze-food-base64', '/api/test-simple']
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 RENDER: Server running on port ${PORT}`);
  console.log(`🚀 RENDER: Health check: http://localhost:${PORT}/`);
  console.log(`🚀 RENDER: Gemini connected: ${geminiConnected}`);
  console.log(`🚀 RENDER: Ready to analyze Indian food! 🍛`);
});