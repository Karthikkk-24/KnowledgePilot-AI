export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  debug: (message: string, fields?: Record<string, unknown>) => void;
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => Logger;
};

type CreateLoggerOptions = {
  service: string;
  level?: LogLevel;
  base?: Record<string, unknown>;
};

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function write(level: LogLevel, service: string, message: string, fields: Record<string, unknown>) {
  const entry = {
    level,
    service,
    message,
    time: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const minLevel = options.level ?? 'info';
  const base = { service: options.service, ...options.base };

  const logAt = (level: LogLevel) => (message: string, fields: Record<string, unknown> = {}) => {
    if (levelWeight[level] < levelWeight[minLevel]) {
      return;
    }
    write(level, options.service, message, { ...base, ...fields });
  };

  return {
    debug: logAt('debug'),
    info: logAt('info'),
    warn: logAt('warn'),
    error: logAt('error'),
    child(bindings) {
      return createLogger({
        service: options.service,
        level: minLevel,
        base: { ...base, ...bindings },
      });
    },
  };
}
