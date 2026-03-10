'use strict';

const express = require('express');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/servers
 * List all active VPN servers.
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const servers = db.prepare(`
      SELECT
        s.id, s.name, s.hostname, s.country, s.city,
        s.ip_address, s.port, s.public_key, s.max_peers, s.is_active,
        (SELECT COUNT(*) FROM vpn_peers WHERE server_id = s.id AND is_connected = 1) as connected_peers
      FROM vpn_servers s
      WHERE s.is_active = 1
      ORDER BY s.country, s.city
    `).all();

    // Calculate load percentage
    const result = servers.map((s) => ({
      ...s,
      load: Math.round((s.connected_peers / s.max_peers) * 100),
    }));

    res.json({ servers: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

/**
 * GET /api/servers/:id
 * Get details of a specific server.
 */
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const server = db.prepare(`
      SELECT
        s.id, s.name, s.hostname, s.country, s.city,
        s.ip_address, s.port, s.public_key, s.max_peers, s.is_active, s.dns,
        (SELECT COUNT(*) FROM vpn_peers WHERE server_id = s.id AND is_connected = 1) as connected_peers
      FROM vpn_servers s
      WHERE s.id = ?
    `).get(req.params.id);

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    server.load = Math.round((server.connected_peers / server.max_peers) * 100);

    res.json({ server });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch server' });
  }
});

module.exports = router;
