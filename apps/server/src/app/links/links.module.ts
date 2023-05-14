import { Module } from '@nestjs/common';
import { LinksController } from './controller/links.controller';
import { LinksService } from "./service/links.service";

@Module({
  providers: [LinksService],
  controllers: [LinksController]
})
export class LinksModule {}
