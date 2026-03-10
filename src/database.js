'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'nexus-vpn.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema();
    seedDefaultData();
  }
  return db;
}

function initializeSchema() {
  const database = db;

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vpn_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hostname TEXT NOT NULL,
      country TEXT NOT NULL,
      city TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 51820,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      dns TEXT NOT NULL DEFAULT '1.1.1.1, 8.8.8.8',
      max_peers INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vpn_peers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      preshared_key TEXT NOT NULL,
      assigned_ip TEXT NOT NULL,
      is_connected INTEGER NOT NULL DEFAULT 0,
      last_handshake TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (server_id) REFERENCES vpn_servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS connection_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      event TEXT NOT NULL,
      bytes_sent INTEGER NOT NULL DEFAULT 0,
      bytes_received INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (server_id) REFERENCES vpn_servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bandwidth_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      bytes_sent INTEGER NOT NULL DEFAULT 0,
      bytes_received INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (server_id) REFERENCES vpn_servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      kill_switch INTEGER NOT NULL DEFAULT 0,
      auto_connect INTEGER NOT NULL DEFAULT 0,
      preferred_server_id TEXT,
      preferred_protocol TEXT NOT NULL DEFAULT 'wireguard',
      dns_servers TEXT NOT NULL DEFAULT '1.1.1.1, 8.8.8.8',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function generateWgKeyPair() {
  const privateKey = crypto.randomBytes(32).toString('base64');
  const publicKey = crypto.randomBytes(32).toString('base64');
  return { privateKey, publicKey };
}

function seedDefaultData() {
  const database = db;
  const serverCount = database.prepare('SELECT COUNT(*) as count FROM vpn_servers').get();

  if (serverCount.count === 0) {
    const servers = [
      { name: 'US East', hostname: 'us-east.nexusvpn.io', country: 'United States', city: 'New York', ip: '10.0.1.1' },
      { name: 'US West', hostname: 'us-west.nexusvpn.io', country: 'United States', city: 'Los Angeles', ip: '10.0.2.1' },
      { name: 'EU Central', hostname: 'eu-central.nexusvpn.io', country: 'Germany', city: 'Frankfurt', ip: '10.0.3.1' },
      { name: 'EU West', hostname: 'eu-west.nexusvpn.io', country: 'Netherlands', city: 'Amsterdam', ip: '10.0.4.1' },
      { name: 'Asia Pacific', hostname: 'ap-east.nexusvpn.io', country: 'Japan', city: 'Tokyo', ip: '10.0.5.1' },
      { name: 'UK London', hostname: 'uk.nexusvpn.io', country: 'United Kingdom', city: 'London', ip: '10.0.6.1' },
      { name: 'Canada East', hostname: 'ca-east.nexusvpn.io', country: 'Canada', city: 'Toronto', ip: '10.0.7.1' },
      { name: 'Australia', hostname: 'au.nexusvpn.io', country: 'Australia', city: 'Sydney', ip: '10.0.8.1' },
    ];

    const insertServer = database.prepare(`
      INSERT INTO vpn_servers (id, name, hostname, country, city, ip_address, port, public_key, private_key)
      VALUES (?, ?, ?, ?, ?, ?, 51820, ?, ?)
    `);

    for (const server of servers) {
      const keys = generateWgKeyPair();
      insertServer.run(
        crypto.randomUUID(),
        server.name,
        server.hostname,
        server.country,
        server.city,
        server.ip,
        keys.publicKey,
        keys.privateKey
      );
    }
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
