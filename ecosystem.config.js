module.exports = {
  apps: [
    {
      name: 'enfyra-app',
      script: 'dist/main.js',
      instances: '3',
      exec_mode: 'cluster',
      watch: false,
    },
  ],
};
