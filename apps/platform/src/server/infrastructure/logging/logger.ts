import 'server-only';

export type LogMetadata = Readonly<Record<string, boolean | number | string | undefined>>;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, event: string, metadata?: LogMetadata): void;
}

export const logger: Logger = {
  log(level, event, metadata = {}) {
    const entry = { event, level, ...metadata };

    if (level === 'error') {
      console.error(JSON.stringify(entry));
      return;
    }

    if (level === 'warn') {
      console.warn(JSON.stringify(entry));
      return;
    }

    console.info(JSON.stringify(entry));
  },
};
