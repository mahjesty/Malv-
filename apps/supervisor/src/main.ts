import "./envload";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.SUPERVISOR_PORT ?? 8090);
  await app.listen(port, process.env.SUPERVISOR_HOST ?? "0.0.0.0");
}

bootstrap();

