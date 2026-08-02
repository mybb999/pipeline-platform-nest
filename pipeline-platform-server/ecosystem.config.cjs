module.exports = {
  apps: [
    {
      name: 'server',
      script: './dist/src/main.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      env: { NODE_ENV: 'production', PORT: '3000' },
    },
    {
      name: 'worker',
      script: './dist/src/worker.js',
      instances: 4,
      exec_mode: 'fork',
      watch: false,
      env: { NODE_ENV: 'production' },
    },
  ],
};
