# NEXUS VPN

A full-featured VPN management application with WireGuard integration and a modern web dashboard.

## Features

- **WireGuard VPN Integration** – Generates real WireGuard configs for peer connections; falls back to simulation when `wg` tools aren't installed
- **User Authentication** – Secure registration and login with bcrypt password hashing and JWT tokens
- **Multi-Server Support** – 8 pre-configured global VPN server locations (US, EU, Asia, Australia, etc.)
- **Web Dashboard** – Modern, responsive single-page dashboard with:
  - Real-time connection status
  - One-click connect/disconnect
  - Server browser with search and load indicators
  - Bandwidth usage statistics
  - Connection logs
  - Kill switch and auto-connect settings
  - DNS configuration
  - WireGuard config file download
- **Bandwidth Tracking** – Per-user upload/download statistics with daily breakdowns
- **Connection Logging** – Complete history of connect/disconnect events

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open the dashboard
open http://localhost:3000
```

## Development

```bash
# Start with file watching (auto-restart on changes)
npm run dev

# Run tests
npm test
```

## Architecture

```
src/
├── server.js            # Entry point, starts Express server
├── app.js               # Express app configuration and middleware
├── database.js          # SQLite database setup and schema
├── middleware/
│   └── auth.js          # JWT authentication middleware
├── routes/
│   ├── auth.js          # Registration, login, profile endpoints
│   ├── servers.js       # VPN server listing endpoints
│   ├── connections.js   # Connect/disconnect, status, logs, bandwidth
│   └── settings.js      # User preferences (kill switch, DNS, etc.)
└── services/
    └── wireguard.js     # WireGuard key generation and config builder

public/
├── index.html           # Single-page application shell
├── css/
│   └── style.css        # Dashboard styles (dark theme)
└── js/
    ├── api.js           # API client
    └── app.js           # Dashboard logic and UI

tests/
└── api.test.js          # API integration tests
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Sign in |
| `GET` | `/api/auth/me` | Get current user profile |
| `GET` | `/api/servers` | List all VPN servers |
| `GET` | `/api/servers/:id` | Get server details |
| `POST` | `/api/connections/connect` | Connect to a server |
| `POST` | `/api/connections/disconnect` | Disconnect from VPN |
| `GET` | `/api/connections/status` | Get connection status |
| `GET` | `/api/connections/logs` | Get connection history |
| `GET` | `/api/connections/bandwidth` | Get bandwidth stats |
| `GET` | `/api/connections/config/:serverId` | Download WireGuard config |
| `GET` | `/api/settings` | Get user settings |
| `PUT` | `/api/settings` | Update user settings |
| `GET` | `/api/health` | Health check |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | dev default | JWT signing secret (change in production) |
| `DB_PATH` | `./nexus-vpn.db` | SQLite database file path |

## Deployment

For production deployment with real WireGuard VPN functionality:

1. Install WireGuard on the server: `apt install wireguard`
2. Set a strong `JWT_SECRET` environment variable
3. Configure firewall rules for UDP port 51820
4. Run with `NODE_ENV=production npm start`

The application automatically detects whether WireGuard tools are installed and uses real cryptographic key generation when available.

## License

Apache License 2.0
