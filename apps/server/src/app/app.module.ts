import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LinksModule } from './links/links.module';
import { NotificationModule } from "./notification/notification.module";
import { AuthorizationModuleModule } from "./authorization/authorization.module";

@Module({
  imports: [LinksModule, NotificationModule, AuthorizationModuleModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
