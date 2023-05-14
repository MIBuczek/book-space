import { Module } from '@nestjs/common';
import { AuthorizationController } from './controller/authorization.controller';
import { AuthorizationService } from "./service/authorization.service";

@Module({
  providers: [AuthorizationService],
  controllers: [AuthorizationController]
})
export class AuthorizationModuleModule {}
