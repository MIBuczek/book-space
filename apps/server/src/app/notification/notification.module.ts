import { Module } from '@nestjs/common';
import { NotificationService } from './service/notification.service';
import { NotificationController } from "./controller/notification.controller";

@Module({
  providers: [NotificationService],
  controllers: [NotificationController]
})
export class NotificationModule {}
