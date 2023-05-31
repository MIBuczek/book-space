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
import {ClientService} from '../service/client.service';
import {AuthGuard} from '@nestjs/passport';
import {ClientDto} from '../models/client.dto';

@Controller('clients')
export class ClientController {
  constructor(private clientService: ClientService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  getAllClients() {
    return this.clientService.findAllClients();
  }

  @Get(':_id')
  @UseGuards(AuthGuard('jwt'))
  getSingleClient(@Param('_id') _id: string) {
    return this.clientService.findClient(_id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  createClient(@Body(new ValidationPipe()) newClient: ClientDto) {
    return this.clientService.createClient(newClient);
  }

  @Put(':_id')
  @UseGuards(AuthGuard('jwt'))
  updateClient(@Param('_id') _id: string, @Body(new ValidationPipe()) client: Partial<ClientDto>) {
    return this.clientService.updateClient(_id, client);
  }

  @Delete('_id')
  @UseGuards(AuthGuard('jwt'))
  deleteClient(@Param('_id') _id: string) {
    return this.clientService.deleteClient(_id);
  }
}
