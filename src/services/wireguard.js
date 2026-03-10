'use strict';

const { execFile } = require('child_process');
const crypto = require('crypto');
const { getDb } = require('../database');

let wgAvailable = null;

/**
 * Check if WireGuard tools are installed on the system.
 */
function isWireGuardAvailable() {
  if (wgAvailable !== null) return Promise.resolve(wgAvailable);

  return new Promise((resolve) => {
    execFile('which', ['wg'], (error) => {
      wgAvailable = !error;
      resolve(wgAvailable);
    });
  });
}

/**
 * Generate a WireGuard key pair.
 * Uses real wg tools if available, falls back to crypto simulation.
 */
async function generateKeyPair() {
  const available = await isWireGuardAvailable();

  if (available) {
    return new Promise((resolve, reject) => {
      execFile('wg', ['genkey'], (err, privateKey) => {
        if (err) return reject(err);
        const privKey = privateKey.trim();
        execFile('wg', ['pubkey'], { input: privKey }, (err2, publicKey) => {
          if (err2) return reject(err2);
          resolve({ privateKey: privKey, publicKey: publicKey.trim() });
        });
      });
    });
  }

  // Simulation fallback - generate base64 keys of same format
  const privateKey = crypto.randomBytes(32).toString('base64');
  const publicKey = crypto.randomBytes(32).toString('base64');
  return { privateKey, publicKey };
}

/**
 * Generate a preshared key for extra security.
 */
async function generatePresharedKey() {
  const available = await isWireGuardAvailable();

  if (available) {
    return new Promise((resolve, reject) => {
      execFile('wg', ['genpsk'], (err, psk) => {
        if (err) return reject(err);
        resolve(psk.trim());
      });
    });
  }

  return crypto.randomBytes(32).toString('base64');
}

/**
 * Find the next available IP for a peer on a server.
 */
function getNextAvailableIp(serverId) {
  const db = getDb();
  const server = db.prepare('SELECT ip_address FROM vpn_servers WHERE id = ?').get(serverId);
  if (!server) throw new Error('Server not found');

  const baseParts = server.ip_address.split('.');
  const basePrefix = `${baseParts[0]}.${baseParts[1]}.${baseParts[2]}`;

  const peers = db.prepare(
    'SELECT assigned_ip FROM vpn_peers WHERE server_id = ? ORDER BY assigned_ip'
  ).all(serverId);

  const usedIps = new Set(peers.map((p) => p.assigned_ip));
  // Reserve .1 for the server, start from .2
  for (let i = 2; i < 255; i++) {
    const candidate = `${basePrefix}.${i}`;
    if (!usedIps.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('No available IPs on this server');
}

/**
 * Generate a WireGuard client configuration file.
 */
function generateClientConfig(peer, server) {
  return `[Interface]
PrivateKey = ${peer.private_key}
Address = ${peer.assigned_ip}/32
DNS = ${server.dns}

[Peer]
PublicKey = ${server.public_key}
PresharedKey = ${peer.preshared_key}
Endpoint = ${server.hostname}:${server.port}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`;
}

/**
 * Simulate connection stats for a peer (used when real WireGuard is not available).
 */
function getSimulatedStats(peerId) {
  const now = Date.now();
  return {
    bytesReceived: Math.floor(Math.random() * 100000000),
    bytesSent: Math.floor(Math.random() * 50000000),
    lastHandshake: new Date(now - Math.floor(Math.random() * 60000)).toISOString(),
  };
}

module.exports = {
  isWireGuardAvailable,
  generateKeyPair,
  generatePresharedKey,
  getNextAvailableIp,
  generateClientConfig,
  getSimulatedStats,
};
