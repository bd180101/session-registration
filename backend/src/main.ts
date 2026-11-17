import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Close the database cleanly on Ctrl+C or SIGTERM.
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(
    `API listening on http://localhost:${port}/api/sessions`,
  );
}
void bootstrap();
