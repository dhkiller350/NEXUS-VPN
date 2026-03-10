'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user account.
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const db = getDb();
    const existing = db.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).get(username, email);

    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();

    db.prepare(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(userId, username, email, passwordHash);

    // Create default settings for the user
    db.prepare(
      'INSERT INTO settings (user_id) VALUES (?)'
    ).run(userId);

    const token = jwt.sign(
      { userId, username, role: 'user' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: userId, username, email, role: 'user' },
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate a user and return a JWT.
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDb();
    const user = db.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get the current authenticated user's profile.
 */
router.get('/me', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ?'
    ).get(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;
