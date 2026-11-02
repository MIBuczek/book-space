import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {UserService} from '../service/user.service';
import {AuthGuard} from '@nestjs/passport';
import {UserDto, UpdateUserDto} from '../models/user.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';

/**
 * Every route is administrator-only (authorization matrix note 1: the endpoints were
 * guarded by `AuthGuard('jwt')` alone, so any authenticated user could list, create,
 * update and delete users).
 *
 * The restriction is declared once at the class rather than on each route, so a route
 * added later is restricted by default instead of by remembering. A route that
 * legitimately needs a wider audience overrides it with its own `@Roles`, which
 * `RolesGuard` prefers because it reads handler metadata before class metadata.
 *
 * `AuthGuard('jwt')` is listed first because it is what populates `request.user`;
 * guards run in the order they are given, and `RolesGuard` reads the role off that.
 */
@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private userService: UserService) {}

  @Get()
  getAllUsers() {
    return this.userService.findAllUser();
  }

  @Get(':_id')
  getSingleUser(@Param('_id') _id: string) {
    return this.userService.findUser(_id);
  }

  @Post()
  createUser(@Body() newUser: UserDto) {
    return this.userService.createUser(newUser);
  }

  @Put(':_id')
  updateUser(@Param('_id') _id: string, @Body() user: UpdateUserDto) {
    return this.userService.updateUser(_id, user);
  }

  @Delete(':_id')
  deleteUser(@Param('_id') _id: string) {
    return this.userService.deleteUser(_id);
  }
}
