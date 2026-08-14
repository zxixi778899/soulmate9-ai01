/**
 * Supabase Mock Server - Local Development Only
 * 
 * This provides a lightweight mock of Supabase Auth & Database APIs
 * for local development without needing real credentials.
 * 
⚠️ NOT FOR PRODUCTION USE - Replace with actual Supabase before deployment!
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// In-memory "database" for testing (replace with PostgreSQL connection in prod)
const DB = {
  users: [],
  girlfriends: [],
  chat_messages: [],
  intimacy_scores: []
};

// ============================================================================
// Authentication Endpoints
// ============================================================================

// Sign up endpoint (mock)
app.post('/auth/signUp', async (req, res) => {
  const { email, password, options } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  // Create mock user
  const user = {
    id: `user-${Date.now()}`,
    email,
    created_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString()
  };
  
  DB.users.push(user);
  
  // Generate mock JWT
  const token = jwt.sign({ user_id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  
  res.json({
    user,
    session: {
      access_token: token,
      refresh_token: `refresh-${token}`,
      expires_in: 604800,
      token_type: 'bearer'
    },
    user_metadata: { email }
  });
});

// Sign in endpoint (mock)
app.post('/auth/signInWithPassword', async (req, res) => {
  const { email, password } = req.body;
  
  // Find user or create new one for convenience
  let user = DB.users.find(u => u.email === email);
  if (!user) {
    user = {
      id: `user-${Date.now()}`,
      email,
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString()
    };
    DB.users.push(user);
  } else {
    user.last_sign_in_at = new Date().toISOString();
  }
  
  const token = jwt.sign({ user_id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  
  res.json({
    user,
    session: {
      access_token: token,
      refresh_token: `refresh-${token}`,
      expires_in: 604800,
      token_type: 'bearer'
    }
  });
});

// Verify token endpoint
app.post('/auth/verify', async (req, res) => {
  const { token } = req.body;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = DB.users.find(u => u.id === decoded.user_id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({ data: { user }, error: null });
  } catch (error) {
    res.status(401).json({ data: null, error: 'Invalid token' });
  }
});

// ============================================================================
// Database Proxy (Passthrough to PostgreSQL via COZE proxy or direct)
// ============================================================================

// Generic SQL query handler
app.post('/rest/v1/*', async (req, res) => {
  const table = req.params[0].split('/')[0];
  const action = req.method.toLowerCase();
  
  console.log(`[SupabaseMock] ${action.toUpperCase()} /rest/v1/${table}`);
  
  try {
    // Simulate SELECT
    if (action === 'get' && table === 'profiles') {
      const userId = req.query.user_id;
      const profile = DB.users.find(u => u.id === userId);
      
      res.json(profile ? [profile] : []);
      return;
    }
    
    // Simulate INSERT
    if (action === 'post') {
      const inserted = req.body;
      inserted.id = `${table}-${Date.now()}`;
      inserted.created_at = new Date().toISOString();
      
      if (!DB[table]) DB[table] = [];
      DB[table].push(inserted);
      
      res.json([inserted]).status(201);
      return;
    }
    
    // Default: return empty array
    res.json([]);
    
  } catch (error) {
    console.error('[SupabaseMock] Query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Health Check & Info
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/info', (req, res) => {
  res.json({
    name: 'SoulMate AI Supabase Mock',
    version: '1.0.0',
    description: 'Local development only - DO NOT USE IN PRODUCTION',
    services: {
      postgres: process.env.POSTGRES_URL ? 'connected' : 'disconnected',
      redis: process.env.REDIS_URL ? 'connected' : 'disconnected'
    }
  });
});

// ============================================================================
// Error Handling
// ============================================================================

app.use((err, req, res, next) => {
  console.error('[SupabaseMock] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Supabase Mock running on http://localhost:${PORT}`);
  console.log(`⚠️  LOCAL DEVELOPMENT ONLY - DO NOT DEPLOY TO PRODUCTION\n`);
});
