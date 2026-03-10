'use strict';

const express = require('express');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/settings
 * Get user settings.
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    let settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.userId);

    if (!settings) {
      db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(req.user.userId);
      settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.userId);
    }

    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/settings
 * Update user settings.
 */
router.put('/', authenticateToken, (req, res) => {
  try {
    const { killSwitch, autoConnect, preferredServerId, preferredProtocol, dnsServers } = req.body;
    const db = getDb();

    // Ensure settings row exists
    const existing = db.prepare('SELECT user_id FROM settings WHERE user_id = ?').get(req.user.userId);
    if (!existing) {
      db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(req.user.userId);
    }

    const updates = [];
    const params = [];

    if (killSwitch !== undefined) {
      updates.push('kill_switch = ?');
      params.push(killSwitch ? 1 : 0);
    }
    if (autoConnect !== undefined) {
      updates.push('auto_connect = ?');
      params.push(autoConnect ? 1 : 0);
    }
    if (preferredServerId !== undefined) {
      updates.push('preferred_server_id = ?');
      params.push(preferredServerId);
    }
    if (preferredProtocol !== undefined) {
      updates.push('preferred_protocol = ?');
      params.push(preferredProtocol);
    }
    if (dnsServers !== undefined) {
      updates.push('dns_servers = ?');
      params.push(dnsServers);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No settings to update' });
    }

    params.push(req.user.userId);
    db.prepare(`UPDATE settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);

    const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.userId);
    res.json({ message: 'Settings updated', settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
