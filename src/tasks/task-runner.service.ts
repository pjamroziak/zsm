import { Container, Service } from '@freshgum/typedi';
import { ScrapSiteTask } from './services/scrap-site.service';
import { LoggerService } from '../utils/logger.service';

@Service([ScrapSiteTask, LoggerService])
export class TaskRunnerService {
  constructor(
    private readonly scrapSiteTask: ScrapSiteTask,
    private readonly logger: LoggerService,
  ) {}

  async run() {
    try {
      await this.scrapSiteTask.run();
    } catch (error) {
      this.logger.error(error as object);
    }
  }
}
