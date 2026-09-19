import { Module } from "@nestjs/common";
import { LogsController } from "./logs.controller";
import { LogsService } from "./logs.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { TelegramModule } from "../telegram/telegram.module";

@Module({
  // TelegramModule, for the log-alert fan-out to store admins. Not a cycle: nothing the Telegram
  // module imports reaches back here.
  imports: [PrismaModule, TelegramModule],
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule {}
