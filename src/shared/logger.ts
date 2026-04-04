import pino from 'pino';

/**
 * Application-wide Pino logger.
 *
 * - In development: pretty-printed, debug level
 * - In production: JSON, info level
 */
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

/** Create a child logger with a module name label */
export function createLogger(module: string) {
  return logger.child({ module });
}
