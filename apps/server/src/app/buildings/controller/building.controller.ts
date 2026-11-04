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
import {AuthGuard} from '@nestjs/passport';
import {BuildingService} from '../service/building.service';
import {BuildingDto, UpdateBuildingDto} from '../models/building.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';

/**
 * Read is every staff role; write is `ADMIN` only (authorization matrix rows "Read
 * facilities and employees" and "Create/update/delete facilities").
 *
 * The read set is the class default and the write routes override it, so a route added
 * later is restricted by default. `RolesGuard` prefers the handler's `@Roles` over the
 * class one.
 *
 * `OFFICE` is included in the read set because the matrix's "Read facilities and
 * employees" row is `isAdmin || isOffice || isEmployee`; the legacy
 * `adminSeeContentCredentials` gate quoted by the issue is the Clients/Facilities *tab*,
 * which is narrower than the facility *read*. Where the two disagree the matrix wins, and
 * an office user is not a write role here (the "Create/update/delete facilities" row is
 * administrator-only).
 */
@Controller('buildings')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('EMPLOYEE', 'OFFICE', 'ADMIN')
export class BuildingController {
  constructor(private buildingService: BuildingService) {}

  @Get()
  getAllBuildings() {
    return this.buildingService.findAllBuildings();
  }

  @Get(':_id')
  getSingleBuilding(@Param('_id') _id: string) {
    return this.buildingService.findBuilding(_id);
  }

  @Post()
  @Roles('ADMIN')
  createBuilding(@Body() newBuilding: BuildingDto) {
    return this.buildingService.createBuilding(newBuilding);
  }

  @Put(':_id')
  @Roles('ADMIN')
  updateBuilding(
    @Param('_id') _id: string,
    @Body() building: UpdateBuildingDto
  ) {
    return this.buildingService.updateBuilding(_id, building);
  }

  @Delete(':_id')
  @Roles('ADMIN')
  deleteBuilding(@Param('_id') _id: string) {
    return this.buildingService.deleteBuilding(_id);
  }
}
