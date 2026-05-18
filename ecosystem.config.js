module.exports = {
  apps: [
    {
      name: 'kaslot-backend',
      script: 'server.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
