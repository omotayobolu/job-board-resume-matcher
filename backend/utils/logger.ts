import winston from "winston";

const customLevels = {
  levels: {
    trace: 5,
    debug: 4,
    info: 3,
    warn: 2,
    error: 1,
    fatal: 0,
  },
  colors: {
    trace: "white",
    debug: "green",
    info: "green",
    warn: "yellow",
    error: "red",
    fatal: "red",
  },
};

const formatter = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
  })
);

class Logger {
  private readonly logger: winston.Logger;

  constructor() {
    const prodTransport = new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    });
    const transport = new winston.transports.Console({
      format: formatter,
    });
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      levels: customLevels.levels,
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports:
        process.env.NODE_ENV === "production" ? [prodTransport] : [transport],
    });
    winston.addColors(customLevels.colors);
  }

  trace(message: string, meta?: Record<string, unknown>) {
    this.logger.log("trace", message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.logger.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.logger.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.logger.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.logger.log("error", message, meta);
  }

  fatal(message: string, meta?: Record<string, unknown>) {
    this.logger.log("fatal", message, meta);
  }
}

export const logger = new Logger();
