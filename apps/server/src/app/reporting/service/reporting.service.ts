import {HttpException, Injectable, NotFoundException, UnprocessableEntityException} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {Client} from '../../clients/schemas/client.schema';
import {Booking} from '../../bookings/schemas/booking.schema';
import {IClient} from '@models/client.model';
import {IClientSummary, TCSVRow} from '@models/reporting.model';
import {ISummaryBooking, summariseClient} from '../summary/summary';
import {resolveSummaryRange} from '../summary/range';
import {clientCsvRows, toCsv} from '../csv/csv';
import {errorMessage, errorStatus} from '../../utility/http-error';

/** The range query shared by the summary and the CSV, already parsed by the DTO. */
interface IReportRequest {
  clientId?: string;
  fromMonth?: Date;
  toMonth?: Date;
  fromTheBeginning?: boolean;
}

/**
 * The fields the summary and CSV read off a booking. Projected explicitly rather than reading
 * the whole document: the report is a read model, and selecting only what it uses keeps the
 * query covered by the same indexes the booking list uses and avoids shipping the personal
 * fields the report does not print.
 */
const BOOKING_PROJECTION = {
  clientId: 1,
  accepted: 1,
  place: 1,
  size: 1,
  paymentMethod: 1,
  discount: 1,
  extraOptions: 1,
  selectedOptions: 1,
  comments: 1,
  bookedTimes: 1,
} as const;

@Injectable()
export class ReportingService {
  constructor(
    @InjectModel('Booking') private bookingModel: Model<Booking>,
    @InjectModel('Client') private clientModel: Model<Client>
  ) {}

  /**
   * One client's summary (FR-027). Throws `404` when the client id does not resolve: a summary
   * with a `null` client would be a report about nobody, and the caller named a client, so the
   * honest answer is that it was not found.
   */
  async summary(request: IReportRequest): Promise<IClientSummary> {
    const client = await this.requireClient(request.clientId);
    const range = this.resolveRange(request);
    const bookings = await this.acceptedBookingsForClient(client._id);
    return summariseClient(client, bookings, range);
  }

  /**
   * The CSV for one client, or for every client with accepted bookings in range (FR-028,
   * FR-029). A missing `clientId` means "all clients", which is the combined export; the
   * controller has already refused that for the single-client route.
   */
  async csv(request: IReportRequest): Promise<string> {
    const range = this.resolveRange(request);

    if (request.clientId !== undefined) {
      const client = await this.requireClient(request.clientId);
      const bookings = await this.acceptedBookingsForClient(client._id);
      return toCsv(clientCsvRows(client, bookings, range));
    }

    const clients = (await this.clientModel.find().lean()) as unknown as IClient[];
    const rows: TCSVRow[] = [];
    for (const client of clients) {
      const bookings = await this.acceptedBookingsForClient(client._id);
      rows.push(...clientCsvRows(client, bookings, range));
    }
    return toCsv(rows);
  }

  private resolveRange(request: IReportRequest) {
    try {
      return resolveSummaryRange(request.fromMonth, request.toMonth, request.fromTheBeginning === true);
    } catch (e) {
      // `resolveSummaryRange` rejects a partial or inverted range; both are client errors, so
      // they answer 422 rather than surfacing as a 500. The DTO catches the malformed-date case
      // first; this is the defence that survives a caller bypassing the pipe.
      throw new UnprocessableEntityException(errorMessage(e));
    }
  }

  private async requireClient(clientId: string | undefined): Promise<IClient> {
    if (clientId === undefined) {
      throw new UnprocessableEntityException('A client id is required for a single-client summary');
    }
    let client: IClient | null;
    try {
      client = (await this.clientModel.findOne({_id: clientId}).lean()) as unknown as IClient | null;
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  /**
   * The accepted bookings for one client, as the summary needs to read them.
   *
   * Filtered by `clientId` and `accepted` in the database, matching the legacy
   * `findAllClientReservation`, so the aggregation never sees a booking it must ignore. The
   * projection drops everything the report does not print.
   */
  private async acceptedBookingsForClient(clientId: string): Promise<ISummaryBooking[]> {
    try {
      const bookings = await this.bookingModel
        .find({clientId, accepted: true}, BOOKING_PROJECTION)
        .lean();
      return bookings as unknown as ISummaryBooking[];
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}
