'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const {
  generateKeyPair,
  generatePresharedKey,
  getNextAvailableIp,
  generateClientConfig,
  getSimulatedStats,
} = require('../services/wireguard');

const router = express.Router();

/**
 * POST /api/connections/connect
 * Connect to a VPN server. Creates a peer if none exists.
 */
router.post('/connect', authenticateToken, async (req, res) => {
  try {
    const { serverId } = req.body;
    if (!serverId) {
      return res.status(400).json({ error: 'Server ID is required' });
    }

    const db = getDb();
    const server = db.prepare('SELECT * FROM vpn_servers WHERE id = ? AND is_active = 1').get(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found or inactive' });
    }

    // Disconnect from any currently connected server
    db.prepare(
      'UPDATE vpn_peers SET is_connected = 0 WHERE user_id = ? AND is_connected = 1'
    ).run(req.user.userId);

    // Check if a peer already exists for this user + server
    let peer = db.prepare(
      'SELECT * FROM vpn_peers WHERE user_id = ? AND server_id = ?'
    ).get(req.user.userId, serverId);

    if (!peer) {
      const keys = await generateKeyPair();
      const psk = await generatePresharedKey();
      const assignedIp = getNextAvailableIp(serverId);
      const peerId = crypto.randomUUID();

      db.prepare(`
        INSERT INTO vpn_peers (id, user_id, server_id, public_key, private_key, preshared_key, assigned_ip, is_connected)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(peerId, req.user.userId, serverId, keys.publicKey, keys.privateKey, psk, assignedIp);

      peer = db.prepare('SELECT * FROM vpn_peers WHERE id = ?').get(peerId);
    } else {
      db.prepare('UPDATE vpn_peers SET is_connected = 1, last_handshake = datetime(\'now\') WHERE id = ?').run(peer.id);
      peer = db.prepare('SELECT * FROM vpn_peers WHERE id = ?').get(peer.id);
    }

    // Log the connection event
    db.prepare(`
      INSERT INTO connection_logs (id, user_id, server_id, peer_id, event)
      VALUES (?, ?, ?, ?, 'connected')
    `).run(crypto.randomUUID(), req.user.userId, serverId, peer.id);

    const config = generateClientConfig(peer, server);

    res.json({
      message: 'Connected successfully',
      connection: {
        peerId: peer.id,
        serverName: server.name,
        serverCity: server.city,
        serverCountry: server.country,
        assignedIp: peer.assigned_ip,
        endpoint: `${server.hostname}:${server.port}`,
      },
      config,
    });
  } catch (err) {
    res.status(500).json({ error: 'Connection failed: ' + err.message });
  }
});

/**
 * POST /api/connections/disconnect
 * Disconnect from the current VPN server.
 */
router.post('/disconnect', authenticateToken, (req, res) => {
  try {
    const db = getDb();

    const activePeer = db.prepare(
      'SELECT p.*, s.name as server_name FROM vpn_peers p JOIN vpn_servers s ON p.server_id = s.id WHERE p.user_id = ? AND p.is_connected = 1'
    ).get(req.user.userId);

    if (!activePeer) {
      return res.status(400).json({ error: 'Not currently connected' });
    }

    db.prepare('UPDATE vpn_peers SET is_connected = 0 WHERE id = ?').run(activePeer.id);

    // Log disconnection with simulated stats
    const stats = getSimulatedStats(activePeer.id);
    db.prepare(`
      INSERT INTO connection_logs (id, user_id, server_id, peer_id, event, bytes_sent, bytes_received)
      VALUES (?, ?, ?, ?, 'disconnected', ?, ?)
    `).run(
      crypto.randomUUID(), req.user.userId, activePeer.server_id,
      activePeer.id, stats.bytesSent, stats.bytesReceived
    );

    // Record bandwidth
    db.prepare(`
      INSERT INTO bandwidth_usage (id, user_id, server_id, bytes_sent, bytes_received)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(), req.user.userId, activePeer.server_id,
      stats.bytesSent, stats.bytesReceived
    );

    res.json({
      message: 'Disconnected successfully',
      stats: {
        bytesSent: stats.bytesSent,
        bytesReceived: stats.bytesReceived,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Disconnection failed' });
  }
});

/**
 * GET /api/connections/status
 * Get the current connection status.
 */
router.get('/status', authenticateToken, (req, res) => {
  try {
    const db = getDb();

    const activePeer = db.prepare(`
      SELECT p.*, s.name as server_name, s.city as server_city,
             s.country as server_country, s.hostname, s.port
      FROM vpn_peers p
      JOIN vpn_servers s ON p.server_id = s.id
      WHERE p.user_id = ? AND p.is_connected = 1
    `).get(req.user.userId);

    if (!activePeer) {
      return res.json({ connected: false });
    }

    const stats = getSimulatedStats(activePeer.id);

    res.json({
      connected: true,
      connection: {
        peerId: activePeer.id,
        serverName: activePeer.server_name,
        serverCity: activePeer.server_city,
        serverCountry: activePeer.server_country,
        assignedIp: activePeer.assigned_ip,
        endpoint: `${activePeer.hostname}:${activePeer.port}`,
        lastHandshake: stats.lastHandshake,
        bytesReceived: stats.bytesReceived,
        bytesSent: stats.bytesSent,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * GET /api/connections/logs
 * Get connection history for the current user.
 */
router.get('/logs', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const logs = db.prepare(`
      SELECT cl.*, s.name as server_name, s.city as server_city, s.country as server_country
      FROM connection_logs cl
      JOIN vpn_servers s ON cl.server_id = s.id
      WHERE cl.user_id = ?
      ORDER BY cl.created_at DESC
      LIMIT ?
    `).all(req.user.userId, limit);

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * GET /api/connections/bandwidth
 * Get bandwidth usage stats for the current user.
 */
router.get('/bandwidth', authenticateToken, (req, res) => {
  try {
    const db = getDb();

    const total = db.prepare(`
      SELECT
        COALESCE(SUM(bytes_sent), 0) as total_sent,
        COALESCE(SUM(bytes_received), 0) as total_received
      FROM bandwidth_usage
      WHERE user_id = ?
    `).get(req.user.userId);

    const recent = db.prepare(`
      SELECT
        date(recorded_at) as date,
        SUM(bytes_sent) as bytes_sent,
        SUM(bytes_received) as bytes_received
      FROM bandwidth_usage
      WHERE user_id = ?
      GROUP BY date(recorded_at)
      ORDER BY date DESC
      LIMIT 30
    `).all(req.user.userId);

    res.json({
      total: {
        bytesSent: total.total_sent,
        bytesReceived: total.total_received,
        totalBytes: total.total_sent + total.total_received,
      },
      daily: recent,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bandwidth data' });
  }
});

/**
 * GET /api/connections/config/:serverId
 * Download WireGuard config file for a specific server.
 */
router.get('/config/:serverId', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const peer = db.prepare(
      'SELECT * FROM vpn_peers WHERE user_id = ? AND server_id = ?'
    ).get(req.user.userId, req.params.serverId);

    if (!peer) {
      return res.status(404).json({ error: 'No peer configured for this server. Connect first.' });
    }

    const server = db.prepare('SELECT * FROM vpn_servers WHERE id = ?').get(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const config = generateClientConfig(peer, server);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="nexus-${server.name.replace(/\s+/g, '-').toLowerCase()}.conf"`);
    res.send(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate config' });
  }
});

module.exports = router;
