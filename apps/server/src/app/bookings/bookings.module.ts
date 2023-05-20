import { Module } from '@nestjs/common';
import { BookingController } from './controller/booking.controller';
import { BookingService } from './service/booking.service';

@Module({
  providers: [BookingService],
  controllers: [BookingController],
})
export class BookingsModule {}
