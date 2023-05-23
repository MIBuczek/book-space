import { TClient, IPlace, TPayment } from "@models/booking.model";
import { BookedTime } from "../schemas/booked-time.schemta";
import { Booking } from "../schemas/booking.schema";
import * as Validator from 'class-validator';

export class BookingDto implements Booking {
    @Validator.Contains('INDIVIDUAL', 'COMPANY')
    type: TClient;

    place: IPlace;

    @Validator.Length(3, 3)
    size: string;

    @Validator.MinLength(9)
    clientId: string;

    @Validator.MinLength(3)
    personName: string;
    personCompany: string;

    @Validator.IsEmail()
    @Validator.MinLength(6)
    personEmail: string;

    @Validator.MinLength(9)
    @Validator.MaxLength(15)
    personPhone: string;

    @Validator.IsInt()
    @Validator.Min(0)
    @Validator.Max(10)
    month: number;

    @Validator.MinLength(1)
    bookedTimes: [];

    @Validator.isBoolean()
    accepted: boolean;

    @Validator.MinLength(3)
    @Validator.MaxLength(512)
    comments: string;

    @Validator.Contains('CASH', 'TRANSFER', 'CARD')
    paymentMethod: TPayment;

    @Validator.isBoolean()
    archive: boolean;
}