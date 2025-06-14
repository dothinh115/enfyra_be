module.exports = {
  apps: [
    {
      name: 'dynamiq-app',
      script: 'dist/main.js',
      instances: '5',
      exec_mode: 'cluster',
      watch: false,
    },
  ],
};
