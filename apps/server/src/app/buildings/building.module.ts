import {Module} from '@nestjs/common';
import {BuildingService} from './service/building.service';
import {BuildingController} from './controller/building.controller';
import {MongooseModule} from '@nestjs/mongoose';
import {BuildingSchema} from './schemas/building.schema';
import {JwtStrategy} from '../strategy/jwt.strategy';
import {AuthorizationModule} from '../authorization/authorization.module';
import {ReferenceDataService} from './seed/reference-data.service';

@Module({
  imports: [
    AuthorizationModule,
    MongooseModule.forFeature([{name: 'Building', schema: BuildingSchema}])
  ],
  controllers: [BuildingController],
  providers: [JwtStrategy, BuildingService, ReferenceDataService]
})
export class BuildingModule {}
