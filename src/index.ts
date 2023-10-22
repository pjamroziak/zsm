import 'dotenv/config'
import { TaskRunnerService } from './tasks/task-runner.service';
import { Container, Service } from '@freshgum/typedi';

@Service({ singleton: true },[
  TaskRunnerService
])
class Main {
  constructor(
    private readonly taskRunner: TaskRunnerService,
  ) {}

  async start() {
    await this.taskRunner.run();
  }
}

try {
  await Container.get(Main).start();
} catch (error) {
  console.error(error)
}