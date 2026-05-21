module.exports = {
  apps: [{
    name: 'capture-api',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '127.0.0.1',
    },
    max_memory_restart: '300M',
    error_file: '/var/log/capture-api/err.log',
    out_file: '/var/log/capture-api/out.log',
  }],
};
