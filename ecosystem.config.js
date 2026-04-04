/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    // ─────────────────────────────────────────────────────────
    // Development — run via tsx with file watching
    // ─────────────────────────────────────────────────────────
    {
      name: 'companyrun-dev',
      script: 'npx',
      args: 'tsx src/index.ts',
      cwd: './',
      watch: ['src'],
      ignore_watch: ['node_modules', 'dist', 'drizzle', 'logs', 'frontend'],
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
    },

    // ─────────────────────────────────────────────────────────
    // Production — compiled JS with RPi-optimized settings
    // ─────────────────────────────────────────────────────────
    {
      name: 'companyrun',
      script: 'dist/index.js',
      cwd: './',
      node_args: '--max-old-space-size=512',
      instances: 1,
      exec_mode: 'fork',
      watch: false,

      // ── Memory & restart ──────────────────────────────────
      // RPi 4 has 8 GB RAM — cap the process at 1 GB to leave
      // headroom for nginx, OS, and other services.
      max_memory_restart: '1G',
      max_restarts: 15,
      min_uptime: '10s',
      restart_delay: 4000,
      autorestart: true,

      // Exponential backoff on crash loops
      exp_backoff_restart_delay: 1000,

      // ── Environment ───────────────────────────────────────
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // ── Logging ───────────────────────────────────────────
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Log rotation (requires pm2-logrotate module):
      //   pm2 install pm2-logrotate
      //   pm2 set pm2-logrotate:max_size 10M
      //   pm2 set pm2-logrotate:retain 7
      //   pm2 set pm2-logrotate:compress true

      // ── Graceful shutdown ─────────────────────────────────
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,

      // ── Source map support ────────────────────────────────
      source_map_support: true,
    },
  ],
};
