import {Module} from '@nestjs/common';
import {ClientService} from './service/client.service';
import {ClientController} from './controller/client.controller';
import {MongooseModule} from '@nestjs/mongoose';
import {ClientSchema} from './schemas/client.schema';
import {JwtStrategy} from '@server/strategy/jwt.strategy';
import {AuthorizationModule} from '@server/auth/authorization.module';

@Module({
  imports: [
    AuthorizationModule,
    MongooseModule.forFeature([{name: 'Client', schema: ClientSchema}])
  ],
  controllers: [ClientController],
  providers: [JwtStrategy, ClientService]
})
export class ClientModule {}
