/**
 * PM2 alternative to the systemd unit, for people who prefer it.
 *
 *   npm i -g pm2
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'expensex',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/expensex',
      instances: 1,
      // Next.js keeps in-process state for the realtime stream, so a cluster
      // of workers would deliver events to whichever worker happens to hold
      // the connection. Scale with a shared broker, not with more workers.
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '127.0.0.1',
      },
      max_memory_restart: '512M',
      autorestart: true,
    },
  ],
};
