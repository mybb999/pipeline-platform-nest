module.exports = {
  apps: [
    {
      name: 'server',
      script: './pipeline-platform-server/dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: { NODE_ENV: 'production', PORT: '3000' },
    },
    {
      name: 'worker',
      script: './pipeline-platform-server/dist/src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: { NODE_ENV: 'production' },
    },
  ],
};
