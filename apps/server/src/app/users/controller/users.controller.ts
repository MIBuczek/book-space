import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import {UserService} from '@server/users/service/user.service';
import {TUser} from '@server/users/schemas/user.schema';
import {AuthGuard} from '@nestjs/passport';
import {UserDto} from '@server/users/models/user.dto';

@Controller('users')
export class UsersController {
  constructor(private userService: UserService) {}
  @Get()
  @UseGuards(AuthGuard('jwt'))
  getAllUsers() {
    return this.userService.findAllUser();
  }

  @Get(':_id')
  @UseGuards(AuthGuard('jwt'))
  getSingleUser(@Param('_id') _id: string) {
    return this.userService.findUser(_id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  createUser(@Body(new ValidationPipe()) newUser: UserDto) {
    return this.userService.createUser(newUser);
  }
  @Put(':_id')
  @UseGuards(AuthGuard('jwt'))
  updateUser(@Param('_id') _id: string, @Body(new ValidationPipe()) user: Partial<UserDto>) {
    return this.userService.updateUser(_id, user);
  }

  @Delete(':_id')
  @UseGuards(AuthGuard('jwt'))
  deleteUser(@Param('_id') _id: string) {
    return this.userService.deleteUser(_id);
  }
}
