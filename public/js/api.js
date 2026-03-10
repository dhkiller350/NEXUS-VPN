'use strict';

/**
 * API client for NEXUS VPN backend.
 */
const API = {
  baseUrl: '/api',
  token: localStorage.getItem('nexus_token'),

  /**
   * Set the authentication token.
   */
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('nexus_token', token);
    } else {
      localStorage.removeItem('nexus_token');
    }
  },

  /**
   * Make an authenticated API request.
   */
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const opts = { method, headers };
    if (body) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    return data;
  },

  // Auth
  register(username, email, password) {
    return this.request('POST', '/auth/register', { username, email, password });
  },

  login(username, password) {
    return this.request('POST', '/auth/login', { username, password });
  },

  getProfile() {
    return this.request('GET', '/auth/me');
  },

  // Servers
  getServers() {
    return this.request('GET', '/servers');
  },

  getServer(id) {
    return this.request('GET', `/servers/${encodeURIComponent(id)}`);
  },

  // Connections
  connect(serverId) {
    return this.request('POST', '/connections/connect', { serverId });
  },

  disconnect() {
    return this.request('POST', '/connections/disconnect');
  },

  getStatus() {
    return this.request('GET', '/connections/status');
  },

  getLogs() {
    return this.request('GET', '/connections/logs');
  },

  getBandwidth() {
    return this.request('GET', '/connections/bandwidth');
  },

  // Settings
  getSettings() {
    return this.request('GET', '/settings');
  },

  updateSettings(settings) {
    return this.request('PUT', '/settings', settings);
  },
};
