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
import {AuthGuard} from '@nestjs/passport';
import {ClientDto} from '../../clients/models/client.dto';
import {BuildingService} from '../service/building.service';
import {BuildingDto} from '../models/building.dto';

@Controller('buildings')
export class BuildingController {
  constructor(private buildingService: BuildingService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  getAllClients() {
    return this.buildingService.findAllBuildings();
  }

  @Get(':_id')
  @UseGuards(AuthGuard('jwt'))
  getSingleClient(@Param('_id') _id: string) {
    return this.buildingService.findBuilding(_id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  createClient(@Body(new ValidationPipe()) newBuilding: BuildingDto) {
    return this.buildingService.createBuilding(newBuilding);
  }

  @Put(':_id')
  @UseGuards(AuthGuard('jwt'))
  updateClient(
    @Param('_id') _id: string,
    @Body(new ValidationPipe()) building: Partial<BuildingDto>
  ) {
    return this.buildingService.updateBuilding(_id, building);
  }

  @Delete('_id')
  @UseGuards(AuthGuard('jwt'))
  deleteClient(@Param('_id') _id: string) {
    return this.buildingService.deleteBuilding(_id);
  }
}
