import { Service } from '@freshgum/typedi';
import pino, { Logger } from 'pino';

@Service({
  singleton: true,
}, [])
export class LoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = pino({
      transport: {
        target: 'pino-pretty'
      },
    });
  }

  info(message: string) {
    this.logger.info(message);
  }

  error(obj: object) {
    this.logger.error(obj);
  }
}

