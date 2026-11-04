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
import {ClientService} from '../service/client.service';
import {AuthGuard} from '@nestjs/passport';
import {ClientDto} from '../models/client.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';

/**
 * Reads are office and administrator; writes are administrator only (T025,
 * `authorization-matrix.md`: `adminSeeContentCredentials` gates the clients tab and
 * `adminCredentials` gates every write in `Clients.tsx`).
 *
 * The write restriction is declared at the class and the read audience is widened per
 * route, so the *narrower* rule is the default: a route added later is administrator-only
 * unless it is explicitly opened to `OFFICE`. Declaring the wide audience at the class and
 * narrowing per route would leave a new route readable by every authenticated caller.
 *
 * `AuthGuard('jwt')` is listed first because it populates `request.user`, which
 * `RolesGuard` reads the role off.
 */
@Controller('clients')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
export class ClientController {
  constructor(private clientService: ClientService) {}

  @Get()
  @Roles('OFFICE', 'ADMIN')
  getAllClients() {
    return this.clientService.findAllClients();
  }

  @Get(':_id')
  @Roles('OFFICE', 'ADMIN')
  getSingleClient(@Param('_id') _id: string) {
    return this.clientService.findClient(_id);
  }

  @Post()
  createClient(@Body() newClient: ClientDto) {
    return this.clientService.createClient(newClient);
  }

  @Put(':_id')
  updateClient(@Param('_id') _id: string, @Body() client: Partial<ClientDto>) {
    return this.clientService.updateClient(_id, client);
  }

  @Delete(':_id')
  deleteClient(@Param('_id') _id: string) {
    return this.clientService.deleteClient(_id);
  }
}
