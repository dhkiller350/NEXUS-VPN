'use strict';

/**
 * NEXUS VPN Dashboard Application
 */
const App = {
  state: {
    connected: false,
    currentServer: null,
    servers: [],
    user: null,
  },

  /**
   * Initialize the application.
   */
  init() {
    this.bindEvents();
    if (API.token) {
      this.loadDashboard();
    } else {
      this.showAuth();
    }
  },

  /**
   * Bind all event listeners.
   */
  bindEvents() {
    // Auth forms
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleRegister();
    });

    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').classList.remove('active');
      document.getElementById('register-form').classList.add('active');
      document.getElementById('auth-error').textContent = '';
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-form').classList.remove('active');
      document.getElementById('login-form').classList.add('active');
      document.getElementById('auth-error').textContent = '';
    });

    // Navigation
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateTo(item.dataset.page);
      });
    });

    // Connect button
    document.getElementById('connect-toggle-btn').addEventListener('click', () => {
      this.handleToggleConnect();
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      this.handleLogout();
    });

    // Server search
    document.getElementById('server-search').addEventListener('input', (e) => {
      this.filterServers(e.target.value);
    });

    // Settings
    document.getElementById('save-settings-btn').addEventListener('click', () => {
      this.handleSaveSettings();
    });
  },

  // ===== AUTH =====

  showAuth() {
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('dashboard-screen').classList.remove('active');
  },

  async handleLogin() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('auth-error');

    try {
      errorEl.textContent = '';
      const data = await API.login(username, password);
      API.setToken(data.token);
      this.state.user = data.user;
      this.loadDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  },

  async handleRegister() {
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('auth-error');

    try {
      errorEl.textContent = '';
      const data = await API.register(username, email, password);
      API.setToken(data.token);
      this.state.user = data.user;
      this.loadDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  },

  handleLogout() {
    API.setToken(null);
    this.state = { connected: false, currentServer: null, servers: [], user: null };
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('dashboard-screen').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
    document.getElementById('register-form').classList.remove('active');
  },

  // ===== DASHBOARD =====

  async loadDashboard() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('dashboard-screen').classList.add('active');

    try {
      // Load user profile
      const profileData = await API.getProfile();
      this.state.user = profileData.user;
      this.updateUserDisplay();

      // Load all data in parallel
      await Promise.all([
        this.loadConnectionStatus(),
        this.loadServers(),
        this.loadBandwidth(),
        this.loadLogs(),
        this.loadSettings(),
      ]);
    } catch (err) {
      if (err.message.includes('Authentication') || err.message.includes('Invalid') || err.message.includes('expired')) {
        this.handleLogout();
        this.showToast('Session expired. Please sign in again.', 'error');
      }
    }
  },

  updateUserDisplay() {
    const user = this.state.user;
    if (!user) return;

    document.getElementById('sidebar-username').textContent = user.username;
    document.getElementById('user-avatar').textContent = user.username.charAt(0).toUpperCase();
    document.getElementById('setting-username').textContent = user.username;
    document.getElementById('setting-email').textContent = user.email;
    document.getElementById('setting-joined').textContent = user.created_at
      ? new Date(user.created_at).toLocaleDateString()
      : '—';
  },

  // ===== CONNECTION =====

  async loadConnectionStatus() {
    try {
      const data = await API.getStatus();
      this.state.connected = data.connected;

      const dot = document.querySelector('.status-dot');
      const text = document.getElementById('status-text');
      const btn = document.getElementById('connect-toggle-btn');
      const serverName = document.getElementById('connect-server-name');
      const serverLoc = document.getElementById('connect-server-location');
      const ipDisplay = document.getElementById('connect-ip-display');
      const assignedIp = document.getElementById('assigned-ip');

      if (data.connected) {
        dot.className = 'status-dot connected';
        text.textContent = 'Connected';
        btn.classList.add('connected');
        serverName.textContent = data.connection.serverName;
        serverLoc.textContent = `${data.connection.serverCity}, ${data.connection.serverCountry}`;
        ipDisplay.style.display = 'block';
        assignedIp.textContent = data.connection.assignedIp;
        this.state.currentServer = data.connection;
      } else {
        dot.className = 'status-dot disconnected';
        text.textContent = 'Disconnected';
        btn.classList.remove('connected');
        serverName.textContent = 'Not Connected';
        serverLoc.textContent = 'Select a server to connect';
        ipDisplay.style.display = 'none';
        this.state.currentServer = null;
      }
    } catch {
      // Ignore status errors
    }
  },

  async handleToggleConnect() {
    if (this.state.connected) {
      try {
        await API.disconnect();
        this.showToast('Disconnected from VPN', 'info');
        this.state.connected = false;
        this.loadConnectionStatus();
        this.loadBandwidth();
        this.loadLogs();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    } else {
      // Connect to preferred or first server
      if (this.state.servers.length === 0) {
        await this.loadServers();
      }
      if (this.state.servers.length > 0) {
        this.connectToServer(this.state.servers[0].id);
      } else {
        this.showToast('No servers available', 'error');
      }
    }
  },

  async connectToServer(serverId) {
    try {
      const data = await API.connect(serverId);
      this.state.connected = true;
      this.showToast(`Connected to ${data.connection.serverName}`, 'success');
      this.loadConnectionStatus();
      this.loadServers();
      this.loadLogs();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async disconnectFromServer() {
    try {
      await API.disconnect();
      this.state.connected = false;
      this.showToast('Disconnected from VPN', 'info');
      this.loadConnectionStatus();
      this.loadServers();
      this.loadBandwidth();
      this.loadLogs();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ===== SERVERS =====

  async loadServers() {
    try {
      const data = await API.getServers();
      this.state.servers = data.servers;
      this.renderServers(data.servers);
    } catch {
      // Ignore
    }
  },

  getCountryFlag(country) {
    const flags = {
      'United States': '🇺🇸',
      'Germany': '🇩🇪',
      'Netherlands': '🇳🇱',
      'Japan': '🇯🇵',
      'United Kingdom': '🇬🇧',
      'Canada': '🇨🇦',
      'Australia': '🇦🇺',
      'France': '🇫🇷',
      'Singapore': '🇸🇬',
    };
    return flags[country] || '🌐';
  },

  renderServers(servers) {
    const container = document.getElementById('server-list');

    if (servers.length === 0) {
      container.innerHTML = '<p class="empty-state">No servers available</p>';
      return;
    }

    container.innerHTML = servers.map((s) => {
      const loadClass = s.load < 50 ? 'low' : s.load < 80 ? 'medium' : 'high';
      const isCurrentServer = this.state.connected && this.state.currentServer &&
        this.state.currentServer.serverName === s.name;

      return `
        <div class="server-card" data-server-id="${s.id}">
          <div class="server-card-header">
            <span class="server-name">${s.name}</span>
            <span class="server-flag">${this.getCountryFlag(s.country)}</span>
          </div>
          <div class="server-location">${s.city}, ${s.country}</div>
          <div class="server-meta">
            <span class="server-load">${s.connected_peers}/${s.max_peers} peers • ${s.load}% load</span>
            <div class="load-bar">
              <div class="load-fill ${loadClass}" style="width: ${Math.max(s.load, 3)}%"></div>
            </div>
          </div>
          <div class="server-actions">
            ${isCurrentServer
              ? `<button class="btn btn-danger btn-sm" data-action="disconnect">Disconnect</button>`
              : `<button class="btn btn-primary btn-sm" data-action="connect" data-server="${s.id}">Connect</button>`
            }
            <button class="btn btn-ghost btn-sm" data-action="config" data-server="${s.id}">Config</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind server action buttons via event delegation
    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        const serverId = e.currentTarget.dataset.server;
        if (action === 'connect') this.connectToServer(serverId);
        else if (action === 'disconnect') this.disconnectFromServer();
        else if (action === 'config') this.downloadConfig(serverId);
      });
    });
  },

  filterServers(query) {
    const filtered = this.state.servers.filter((s) => {
      const q = query.toLowerCase();
      return s.name.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q);
    });
    this.renderServers(filtered);
  },

  downloadConfig(serverId) {
    if (!API.token) return;
    window.open(`/api/connections/config/${encodeURIComponent(serverId)}?token=${API.token}`, '_blank');
  },

  // ===== BANDWIDTH =====

  async loadBandwidth() {
    try {
      const data = await API.getBandwidth();
      document.getElementById('stat-downloaded').textContent = this.formatBytes(data.total.bytesReceived);
      document.getElementById('stat-uploaded').textContent = this.formatBytes(data.total.bytesSent);
      document.getElementById('stat-total').textContent = this.formatBytes(data.total.totalBytes);
    } catch {
      // Ignore
    }
  },

  // ===== LOGS =====

  async loadLogs() {
    try {
      const data = await API.getLogs();
      this.renderLogs(data.logs);
      this.renderRecentActivity(data.logs.slice(0, 5));
      document.getElementById('stat-sessions').textContent =
        data.logs.filter((l) => l.event === 'connected').length;
    } catch {
      // Ignore
    }
  },

  renderLogs(logs) {
    const tbody = document.getElementById('logs-tbody');

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No logs yet</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map((log) => `
      <tr>
        <td><span class="event-badge ${log.event}">${log.event}</span></td>
        <td>${log.server_name}</td>
        <td>${log.server_city}, ${log.server_country}</td>
        <td>${this.formatBytes(log.bytes_sent)}</td>
        <td>${this.formatBytes(log.bytes_received)}</td>
        <td>${new Date(log.created_at).toLocaleString()}</td>
      </tr>
    `).join('');
  },

  renderRecentActivity(logs) {
    const container = document.getElementById('recent-activity');

    if (logs.length === 0) {
      container.innerHTML = '<p class="empty-state">No recent activity</p>';
      return;
    }

    container.innerHTML = logs.map((log) => `
      <div class="activity-item">
        <span class="activity-dot ${log.event}"></span>
        <span class="activity-text">${log.event === 'connected' ? 'Connected to' : 'Disconnected from'} ${log.server_name} (${log.server_city})</span>
        <span class="activity-time">${this.timeAgo(log.created_at)}</span>
      </div>
    `).join('');
  },

  // ===== SETTINGS =====

  async loadSettings() {
    try {
      const data = await API.getSettings();
      const s = data.settings;
      document.getElementById('setting-killswitch').checked = !!s.kill_switch;
      document.getElementById('setting-autoconnect').checked = !!s.auto_connect;
      if (s.dns_servers) {
        document.getElementById('setting-dns').value = s.dns_servers;
      }
      if (s.preferred_protocol) {
        document.getElementById('setting-protocol').value = s.preferred_protocol;
      }
    } catch {
      // Ignore
    }
  },

  async handleSaveSettings() {
    try {
      await API.updateSettings({
        killSwitch: document.getElementById('setting-killswitch').checked,
        autoConnect: document.getElementById('setting-autoconnect').checked,
        dnsServers: document.getElementById('setting-dns').value,
        preferredProtocol: document.getElementById('setting-protocol').value,
      });
      this.showToast('Settings saved', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ===== NAVIGATION =====

  navigateTo(page) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

    // Refresh data when navigating
    if (page === 'servers') this.loadServers();
    if (page === 'logs') this.loadLogs();
    if (page === 'settings') this.loadSettings();
    if (page === 'dashboard') {
      this.loadConnectionStatus();
      this.loadBandwidth();
      this.loadLogs();
    }
  },

  // ===== HELPERS =====

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  },

  timeAgo(dateStr) {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  },

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  },
};

// Start the app
document.addEventListener('DOMContentLoaded', () => App.init());
