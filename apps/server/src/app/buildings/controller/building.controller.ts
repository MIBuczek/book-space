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
 * Reads are every staff role; writes are administrator only (T025,
 * `authorization-matrix.md`: `hasRightsToSeeContent` covers `Building.tsx`, and the
 * administrator-gated tab is what allows a write).
 *
 * The write restriction is declared at the class and the read audience is widened per
 * route, so the *narrower* rule is the default: a route added later is administrator-only
 * unless it is explicitly opened to the staff roles. Declaring the wide audience at the
 * class and narrowing per route would leave a new route writable by every authenticated
 * caller.
 *
 * `AuthGuard('jwt')` is listed first because it populates `request.user`, which
 * `RolesGuard` reads the role off.
 */
@Controller('buildings')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
export class BuildingController {
  constructor(private buildingService: BuildingService) {}

  @Get()
  @Roles('EMPLOYEE', 'OFFICE', 'ADMIN')
  getAllBuildings() {
    return this.buildingService.findAllBuildings();
  }

  @Get(':_id')
  @Roles('EMPLOYEE', 'OFFICE', 'ADMIN')
  getSingleBuilding(@Param('_id') _id: string) {
    return this.buildingService.findBuilding(_id);
  }

  @Post()
  createBuilding(@Body() newBuilding: BuildingDto) {
    return this.buildingService.createBuilding(newBuilding);
  }

  @Put(':_id')
  updateBuilding(
    @Param('_id') _id: string,
    @Body() building: UpdateBuildingDto
  ) {
    return this.buildingService.updateBuilding(_id, building);
  }

  @Delete(':_id')
  deleteBuilding(@Param('_id') _id: string) {
    return this.buildingService.deleteBuilding(_id);
  }
}
