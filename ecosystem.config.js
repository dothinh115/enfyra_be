module.exports = {
  apps: [
    {
      name: 'dynamiq-app',
      script: 'dist/main.js',
      instances: '2',
      exec_mode: 'cluster',
      watch: false,
    },
  ],
};
