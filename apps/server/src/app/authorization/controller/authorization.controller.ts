import { Body, Controller, Post, ValidationPipe } from "@nestjs/common";
import { LoginUserDto } from "../models/login-user-dto";

@Controller('auth')
export class AuthorizationController {

  @Post()
  sing_up(@Body(new ValidationPipe()) loginUserDto : LoginUserDto ){

  }
}
