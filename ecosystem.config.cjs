module.exports = {
  apps: [
    {
      name: 'enfyra-app',
      script: 'dist/src/main.js',
      instances: '2',
      exec_mode: 'cluster',
      watch: false,
    },
  ],
};
