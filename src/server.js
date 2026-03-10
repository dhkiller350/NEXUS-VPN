'use strict';

const { createApp } = require('./app');
const { closeDb } = require('./database');

const PORT = process.env.PORT || 3000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║           NEXUS VPN Server               ║
  ║                                          ║
  ║   Dashboard: http://localhost:${PORT}       ║
  ║   API:       http://localhost:${PORT}/api   ║
  ╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down NEXUS VPN...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down NEXUS VPN...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});
