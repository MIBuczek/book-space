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
import {ClientDto, UpdateClientDto} from '../models/client.dto';
import {RolesGuard} from '../../authorization/guards/roles.guard';
import {Roles} from '../../authorization/decorators/roles.decorator';

/**
 * Read is `OFFICE` and `ADMIN`; write is `ADMIN` only (authorization matrix rows
 * "Read clients" and "Create/update/delete clients").
 *
 * The read restriction is the class default so a read route added later inherits it; the
 * write routes override it with `@Roles('ADMIN')`. `RolesGuard` reads the handler metadata
 * before the class metadata (`getAllAndOverride`), so the narrower role wins per route.
 *
 * An `EMPLOYEE` is refused on every route: the legacy `adminSeeContentCredentials` gate
 * (the Clients tab) was `isAdmin || isOffice`, so an employee never reached client data.
 */
@Controller('clients')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('OFFICE', 'ADMIN')
export class ClientController {
  constructor(private clientService: ClientService) {}

  @Get()
  getAllClients() {
    return this.clientService.findAllClients();
  }

  @Get(':_id')
  getSingleClient(@Param('_id') _id: string) {
    return this.clientService.findClient(_id);
  }

  @Post()
  @Roles('ADMIN')
  createClient(@Body() newClient: ClientDto) {
    return this.clientService.createClient(newClient);
  }

  @Put(':_id')
  @Roles('ADMIN')
  updateClient(@Param('_id') _id: string, @Body() client: UpdateClientDto) {
    return this.clientService.updateClient(_id, client);
  }

  @Delete(':_id')
  @Roles('ADMIN')
  deleteClient(@Param('_id') _id: string) {
    return this.clientService.deleteClient(_id);
  }
}
