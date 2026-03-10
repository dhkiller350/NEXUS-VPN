'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Set env vars BEFORE requiring app modules so database.js reads the correct path
const TEST_DB = path.join(__dirname, 'test-nexus.db');
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'test-secret-key';

const { createApp } = require('../src/app');
const { closeDb } = require('../src/database');

let app;

beforeAll(() => {
  // Clean up any leftover test DB from previous runs
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
  app = createApp();
});

afterAll(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

describe('Health Check', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.name).toBe('NEXUS VPN');
  });
});

describe('Authentication', () => {
  let token;

  test('POST /api/auth/register creates a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('testuser');
    token = res.body.token;
  });

  test('POST /api/auth/register rejects short passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'short', email: 'short@example.com', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('8 characters');
  });

  test('POST /api/auth/register rejects duplicate username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'other@example.com', password: 'password123' });

    expect(res.status).toBe(409);
  });

  test('POST /api/auth/login authenticates existing user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  test('POST /api/auth/login rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me returns current user profile', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('testuser');
  });

  test('GET /api/auth/me rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('VPN Servers', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });
    token = res.body.token;
  });

  test('GET /api/servers lists all servers', async () => {
    const res = await request(app)
      .get('/api/servers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.servers)).toBe(true);
    expect(res.body.servers.length).toBeGreaterThan(0);
    expect(res.body.servers[0]).toHaveProperty('name');
    expect(res.body.servers[0]).toHaveProperty('country');
    expect(res.body.servers[0]).toHaveProperty('load');
  });

  test('GET /api/servers requires authentication', async () => {
    const res = await request(app).get('/api/servers');
    expect(res.status).toBe(401);
  });
});

describe('VPN Connections', () => {
  let token;
  let serverId;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });
    token = loginRes.body.token;

    const serversRes = await request(app)
      .get('/api/servers')
      .set('Authorization', `Bearer ${token}`);
    serverId = serversRes.body.servers[0].id;
  });

  test('POST /api/connections/connect creates a VPN connection', async () => {
    const res = await request(app)
      .post('/api/connections/connect')
      .set('Authorization', `Bearer ${token}`)
      .send({ serverId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Connected successfully');
    expect(res.body.connection).toHaveProperty('assignedIp');
    expect(res.body.connection).toHaveProperty('endpoint');
    expect(res.body.config).toContain('[Interface]');
    expect(res.body.config).toContain('[Peer]');
  });

  test('GET /api/connections/status shows connected state', async () => {
    const res = await request(app)
      .get('/api/connections/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.connection).toHaveProperty('serverName');
  });

  test('POST /api/connections/disconnect ends the connection', async () => {
    const res = await request(app)
      .post('/api/connections/disconnect')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Disconnected successfully');
    expect(res.body.stats).toHaveProperty('bytesSent');
  });

  test('GET /api/connections/status shows disconnected state', async () => {
    const res = await request(app)
      .get('/api/connections/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  test('GET /api/connections/logs returns connection history', async () => {
    const res = await request(app)
      .get('/api/connections/logs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);
  });

  test('GET /api/connections/bandwidth returns usage stats', async () => {
    const res = await request(app)
      .get('/api/connections/bandwidth')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toHaveProperty('bytesSent');
    expect(res.body.total).toHaveProperty('bytesReceived');
    expect(res.body.total).toHaveProperty('totalBytes');
  });
});

describe('Settings', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });
    token = res.body.token;
  });

  test('GET /api/settings returns user settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.settings).toHaveProperty('kill_switch');
    expect(res.body.settings).toHaveProperty('auto_connect');
    expect(res.body.settings).toHaveProperty('dns_servers');
  });

  test('PUT /api/settings updates user settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        killSwitch: true,
        autoConnect: true,
        dnsServers: '8.8.8.8, 8.8.4.4',
      });

    expect(res.status).toBe(200);
    expect(res.body.settings.kill_switch).toBe(1);
    expect(res.body.settings.auto_connect).toBe(1);
    expect(res.body.settings.dns_servers).toBe('8.8.8.8, 8.8.4.4');
  });

  test('PUT /api/settings rejects empty updates', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
