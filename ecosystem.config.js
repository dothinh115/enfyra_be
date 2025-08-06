module.exports = {
  apps: [
    {
      name: 'enfyra-app',
      script: 'dist/src/main.js',
      instances: '2',
      exec_mode: 'cluster',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
    },
  ],
};
