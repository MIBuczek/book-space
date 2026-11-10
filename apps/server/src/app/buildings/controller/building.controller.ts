import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {Request} from 'express';
import {AuthGuard} from '@nestjs/passport';
import {BuildingService} from '../service/building.service';
import {BuildingDto, UpdateBuildingDto} from '../models/building.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';
import {OptionalJwtAuthGuard} from '../../authorization/guards/optional-jwt-auth.guard';
import {CurrentUser} from '../../authorization/decorators/current-user.decorator';
import {IActingUser, isStaff} from '../../authorization/ownership';
import {serializePublicBuildings} from '../models/building.serializer';

/**
 * Facilities. The list is public; the single read and every write are staff-only.
 *
 * `GET /buildings` is one route at two levels of detail, the same shape `GET /bookings`
 * uses (T034). A public visitor needs the facility list to populate the calendar's city
 * and facility selectors and the booking form's size options (FR-007), so the route runs
 * `OptionalJwtAuthGuard` and answers a redacted record to an anonymous caller. It is
 * fail-closed on both inputs — `request.isPublic` must be exactly `false` and the user must
 * carry a recognised role — so a request that never reached the guard, or an authenticated
 * request that lost its user, is served the public shape rather than the staff one.
 *
 * The single read (`GET /buildings/:_id`) and the writes stay behind `AuthGuard('jwt')`
 * and `RolesGuard`. Guards are attached per route rather than at the class, because a
 * class-level `AuthGuard('jwt')` runs *before* the method's `OptionalJwtAuthGuard` (Nest
 * concatenates class and method guards) and would reject the anonymous list request the
 * route exists to serve.
 *
 * The write role set is `ADMIN` (authorization matrix: "Create/update/delete facilities");
 * the staff read set is `EMPLOYEE`, `OFFICE` and `ADMIN`, since the matrix's "Read
 * facilities and employees" row is every staff role and the booking form needs the facility
 * list. Where the tab gate (`canSeeFacilitiesTab`, office/administrator) is narrower than
 * the read, the matrix wins.
 */
@Controller('buildings')
export class BuildingController {
  constructor(private buildingService: BuildingService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getAllBuildings(@Req() request: Request, @CurrentUser() user: IActingUser | undefined) {
    const staff = request.isPublic === false && isStaff(user);
    // Staff receive retired facilities too (`includeInactive`), because the Facilities tab shows
    // the record and the Users tab offers it for assignment (T059). A public caller is served only
    // the active ones, so the calendar and booking form cannot offer a facility that is retired.
    const buildings = await this.buildingService.findAllBuildings(staff);

    return staff ? buildings : serializePublicBuildings(buildings);
  }

  @Get(':_id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('EMPLOYEE', 'OFFICE', 'ADMIN')
  getSingleBuilding(@Param('_id') _id: string) {
    return this.buildingService.findBuilding(_id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  createBuilding(@Body() newBuilding: BuildingDto) {
    return this.buildingService.createBuilding(newBuilding);
  }

  @Put(':_id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  updateBuilding(
    @Param('_id') _id: string,
    @Body() building: UpdateBuildingDto
  ) {
    return this.buildingService.updateBuilding(_id, building);
  }

  @Delete(':_id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  deleteBuilding(@Param('_id') _id: string) {
    return this.buildingService.deleteBuilding(_id);
  }
}
