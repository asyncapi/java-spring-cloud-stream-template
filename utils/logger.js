/**
 * Centralized logger for the AsyncAPI code generator
 * Supports different log levels with environment-based control
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Get log level from environment variable, default to ERROR
const getLogLevel = () => {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  return LOG_LEVELS[envLevel] !== undefined ? LOG_LEVELS[envLevel] : LOG_LEVELS.DEBUG;
};

let currentLogLevel = getLogLevel();

/**
 * Format log message with timestamp and context
 */
const formatMessage = (level, context, message, data) => {
  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}]` : '';
  const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';
  return `${timestamp} ${level}${contextStr}: ${message}${dataStr}`;
};

/**
 * Check if a log level should be output
 */
const shouldLog = (level) => {
  return LOG_LEVELS[level] <= currentLogLevel;
};

/**
 * Logger class with different log levels
 */
class Logger {
  constructor(context = '') {
    this.context = context;
  }

  error(message, data = null) {
    if (shouldLog('ERROR')) {
      console.error(formatMessage('ERROR', this.context, message, data));
    }
  }

  warn(message, data = null) {
    if (shouldLog('WARN')) {
      console.warn(formatMessage('WARN', this.context, message, data));
    }
  }

  info(message, data = null) {
    if (shouldLog('INFO')) {
      console.log(formatMessage('INFO', this.context, message, data));
    }
  }

  debug(message, data = null) {
    if (shouldLog('DEBUG')) {
      console.log(formatMessage('DEBUG', this.context, message, data));
    }
  }

  /**
   * Create a new logger instance with a specific context
   */
  withContext(context) {
    return new Logger(context);
  }

  /**
   * Get current log level name
   */
  getCurrentLevel() {
    return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === currentLogLevel) || 'ERROR';
  }

  /**
   * Set log level dynamically
   * @param {string} level - Log level name (ERROR, WARN, INFO, DEBUG)
   */
  setLevel(level) {
    const upperLevel = level.toUpperCase();
    if (LOG_LEVELS[upperLevel] !== undefined) {
      currentLogLevel = LOG_LEVELS[upperLevel];
    } else {
      console.warn(`Invalid log level: ${level}. Valid levels are: ${Object.keys(LOG_LEVELS).join(', ')}`);
    }
  }
}

// Create default logger instance
const logger = new Logger();

/**
 * Set the global log level for all logger instances
 * @param {string} level - Log level name (ERROR, WARN, INFO, DEBUG)
 */
const setLogLevel = (level) => {
  const upperLevel = level.toUpperCase();
  if (LOG_LEVELS[upperLevel] !== undefined) {
    currentLogLevel = LOG_LEVELS[upperLevel];
  } else {
    console.warn(`Invalid log level: ${level}. Valid levels are: ${Object.keys(LOG_LEVELS).join(', ')}`);
  }
};

/**
 * Configure logger based on AsyncAPI generator settings
 * @param {object} generator - AsyncAPI generator instance
 */
const configureFromGenerator = (generator) => {
  if (generator && generator.debug) {
    setLogLevel('DEBUG');
    logger.debug('Logger configured from generator: DEBUG level enabled');
  } else {
    // Keep current level or fall back to environment variable
    const envLevel = process.env.LOG_LEVEL;
    if (!envLevel) {
      setLogLevel('ERROR'); // Default to ERROR if no debug and no env var
    }
    logger.debug(`Logger configured: ${logger.getCurrentLevel()} level`);
  }
};

// Export both the class and default instance
module.exports = {
  Logger,
  logger,
  LOG_LEVELS,
  setLogLevel,
  configureFromGenerator
}; 