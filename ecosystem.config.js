module.exports = {
  apps: [
    {
      name: 'dynamiq-app',
      script: 'dist/main.js',
      instances: '7',
      exec_mode: 'cluster',
      watch: false,
    },
  ],
};
