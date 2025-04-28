const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Define a cross-platform safe directory for logs
const logDirectory = path.join(os.homedir(), '.cactus', 'logs');

// Ensure the log directory exists
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const logger = createLogger({
  level: 'error',
  format: format.combine(
    format.timestamp({ format: () => new Date().toLocaleString() }), // Use local date and time
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
      return `${timestamp} [${level}]: ${message} ${metaString}`;
    })
  ),
  transports: [
    new transports.DailyRotateFile({
      filename: path.join(logDirectory, 'cactus-app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '7d' // Keeps logs for 7 days
    }),
    new transports.Console() // Optional: Log to console for debugging
  ],
  exceptionHandlers: [
    new transports.DailyRotateFile({
      filename: path.join(logDirectory, 'cactus-exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '7d'
    })
  ]
});

// Overriding the logger methods to handle multiple arguments
['info', 'warn', 'error', 'debug'].forEach(level => {
  const originalMethod = logger[level];
  logger[level] = (...args) => {
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    originalMethod.call(logger, message);
  };
});

module.exports = logger;