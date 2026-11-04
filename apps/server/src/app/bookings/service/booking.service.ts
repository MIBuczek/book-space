import {ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Booking, TBooking} from '../schemas/booking.schema';
import {Model} from 'mongoose';
import {BookedTime} from '../schemas/booked-time.schemta';
import {BookedTimeDto} from '../models/booked-time.dto';
import {BookingQueryDto} from '../models/booking-query.dto';
import {BookingRangeRequiredError, buildBookingQuery, resolveBookingListRequest} from '../list/booking-list';
import {findResolvedSlotViolation, resolvedSlotMessage} from '../slots/resolved-slots';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {StructuredLogger} from '../../logging/structured-logger';
import {currentActorId} from '../../logging/request-context';
import {findConflictingBookingIds, findConflictsWith} from '../conflicts/conflicts';
import {StructuredHttpException} from '../../config/structured-http-exception';

const CHANGE_LABELS: Array<[keyof Booking, string]> = [
  ['accepted', 'approval'],
  ['archive', 'archive'],
];

const describeBookingChange = (booking: Partial<Booking>): string => {
  const labels = CHANGE_LABELS.filter(([field]) => field in booking).map(([, label]) => label);
  return labels.length > 0 ? labels.join('+') : 'fields';
};

@Injectable()
export class BookingService {
  constructor(
    @InjectModel('Booking') private bookingModel: Model<Booking>,
    private readonly logger: StructuredLogger
  ) {}

  async createBooking(booking: Booking) {
    try {
      const created = await this.bookingModel.create(booking);
      this.logger.log('booking.created', {bookingId: created._id, actorId: currentActorId()});
      return created;
    } catch (e) {
      this.logger.error('booking.create.failed', {actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async updateBooking(_id: string, booking: Partial<Booking>) {
    try {
      // The owner reference is never updatable. The update body is typed
      // `Partial<BookingDto>`, and a mapped type is erased at runtime, so the global
      // pipe sees `Object` and whitelists nothing on this route — a caller could
      // otherwise send `createdBy` and hand the booking to themselves. Stripping it
      // here is the enforcement that does not depend on the DTO being a class.
      //
      // `accepted` and `archive` are stripped for the same reason and a stronger one:
      // they are the administrator decisions T020 moved behind
      // `POST /bookings/{_id}/approve` and `/archive`, where the conflict check and the
      // audit stamp live. Leaving them settable here would let a booking's owner approve
      // their own request and skip the conflict check entirely — the rule would exist on
      // one route and be absent on the other that writes the same field.
      const updates = {...booking};
      delete updates.createdBy;
      delete updates.accepted;
      delete updates.archive;
      // `bookedTimes` is stripped for the same reason as the decision fields: the slot
      // list has its own route (`PUT /bookings/{_id}/booked-times`) where the resolved-slot
      // rule (FR-018) runs. A `BookingDto` declares `bookedTimes`, so leaving it settable
      // here would let an owner replace the slots on the generic update and skip that
      // rule entirely — the guard would exist on one route and be absent on the other
      // that writes the same field.
      delete updates.bookedTimes;

      // After stripping the fields above an update can be empty — a caller who sent
      // only `accepted`, or the ownership spec's default body. MongoDB rejects an empty
      // update document ("requires at least one atomic operator"), which would surface
      // as a `500` on a request that asked for nothing. A no-op is a success.
      if (Object.keys(updates).length === 0) {
        this.logger.log('booking.updated', {bookingId: _id, actorId: currentActorId(), action: 'none'});
        return {acknowledged: true, matchedCount: 1, modifiedCount: 0};
      }

      const result = await this.bookingModel.updateOne({_id}, updates);
      // The changed field names are logged, not their values: they identify an
      // approval or an archive without recording personal data. The names are
      // mapped to a fixed action so a caller cannot inject a new label.
      this.logger.log('booking.updated', {
        bookingId: _id,
        actorId: currentActorId(),
        action: describeBookingChange(updates),
      });
      return result;
    } catch (e) {
      this.logger.error('booking.update.failed', {bookingId: _id, actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Replaces a booking's slot list, refusing to edit or delete a resolved slot (FR-018).
   *
   * The rule is stated over a replacement because that is what the route does: the body is
   * the complete desired list. `findResolvedSlotViolation` compares it against the stored
   * list and reports the first resolved slot that is missing or different; either is
   * refused with `409` and the message the UI shows, and the record is left untouched
   * because the check runs before the write.
   *
   * The booking is read here rather than passed in from the controller's ownership check:
   * the rule needs the *stored* slots, and reading them where the decision is made keeps
   * the check and the write in one method. The read is on the primary key.
   *
   * `modifiedBy`/`modifiedAt` are stamped with the write (FR-016), so a slot change is
   * attributable like an approval.
   */
  async updateBookedTimes(_id: string, bookedTimes: BookedTimeDto[]) {
    try {
      const booking = await this.bookingModel.findOne({_id});
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const violation = findResolvedSlotViolation(booking.bookedTimes ?? [], bookedTimes);
      if (violation) {
        this.logger.warn('booking.booked_times.rejected', {
          bookingId: _id,
          actorId: currentActorId(),
          reason: violation.kind,
        });
        throw new ConflictException(resolvedSlotMessage(violation.kind));
      }

      const result = await this.bookingModel.updateOne(
        {_id},
        {bookedTimes, modifiedBy: currentActorId(), modifiedAt: new Date()}
      );
      this.logger.log('booking.booked_times.updated', {bookingId: _id, actorId: currentActorId()});
      return result;
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      this.logger.error('booking.booked_times.failed', {bookingId: _id, actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async deleteBooking(_id: string) {
    try {
      const result = await this.bookingModel.deleteOne({_id});
      this.logger.log('booking.deleted', {bookingId: _id, actorId: currentActorId()});
      return result;
    } catch (e) {
      this.logger.error('booking.delete.failed', {bookingId: _id, actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async findBooking(_id: string) {
    try {
      return await this.bookingModel.findOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * The ids of the unaccepted bookings that conflict within one facility-month
   * (FR-015, contracts/openapi.yaml `/bookings/conflicts`).
   *
   * The facility and month are pushed into the query rather than filtered after the
   * read, for the same reason the public calendar filter is: an unrelated booking is
   * never loaded. Only `accepted: false` is required by the rules, but the query is
   * scoped to the facility-month regardless, because that is the unit the legacy
   * screen computed over and the only scope in which the answer is meaningful.
   *
   * The comparison itself lives in the pure `findConflictingBookingIds`, which is
   * where the rules and their SC-002 oracle are. This method only shapes the query
   * and adapts the documents to what that function reads.
   */
  async findConflictingBookingIds(city: string, building: string, month: number): Promise<string[]> {
    try {
      const bookings = await this.bookingModel.find({
        'place.city': city,
        'place.place': building,
        month,
      });

      // `_id` on a hydrated document is an `ObjectId`, not the `string` the pure
      // function declares, so it is converted here rather than hidden behind a cast.
      // The module compares ids for identity and returns them; handing it an
      // `ObjectId` would make the returned "ids" serialize as hex strings by accident
      // and the identity test depend on reference equality (T017's trap).
      return findConflictingBookingIds(
        bookings.map((booking) => ({
          _id: String(booking._id),
          month: booking.month,
          accepted: booking.accepted,
          bookedTimes: booking.bookedTimes,
        }))
      );
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * The ids of the bookings that conflict with one already-loaded booking
   * (FR-015, FR-017).
   *
   * Scoped to the booking's own facility and month, because those are the only
   * bookings the conflict rules compare against. `String(_id)` on the record and on
   * every candidate keeps the comparison in the `string` domain the pure function
   * declares; passing an `ObjectId` would make the identity test depend on reference
   * equality.
   *
   * The booking is passed in rather than looked up again, so an approval does not
   * read the same document twice.
   */
  private async conflictsFor(booking: TBooking): Promise<string[]> {
    const candidates = await this.bookingModel.find({
      'place.city': booking.place.city,
      'place.place': booking.place.place,
      month: booking.month,
    });

    const asConflict = (record: {_id: unknown; month: number; accepted: boolean; bookedTimes: BookedTime[]}) => ({
      _id: String(record._id),
      month: record.month,
      accepted: record.accepted,
      bookedTimes: record.bookedTimes,
    });

    return findConflictsWith(
      asConflict(booking),
      candidates.map((candidate) => asConflict(candidate))
    );
  }

  /**
   * Approves or unapproves a booking, refusing an approval that would keep a conflict
   * unless `force` is set (FR-017, contracts/openapi.yaml `/bookings/{_id}/approve`).
   *
   * The conflict check runs only when *accepting*: unapproving cannot introduce a
   * double booking, and refusing to unapprove a conflicted booking would trap it.
   * The conflicts are returned even when `force` allowed the approval, because the
   * contract's `200` reports them so the UI can keep showing the warning.
   *
   * The check and the write are two operations, so two simultaneous approvals can
   * still both pass it and both be written — the window is one request wide, and the
   * outcome is the same conflict the `force` path allows deliberately. A unique index
   * on the slot would close it, but the domain permits overlapping unapproved
   * requests, so a constraint would reject legitimate data.
   *
   * The write and the `modifiedBy`/`modifiedAt` stamp are one atomic
   * `findOneAndUpdate` rather than a read-modify-write, so the audit fields cannot be
   * lost to a concurrent change between the read and the write (FR-016).
   */
  async setApproval(_id: string, accepted: boolean, force: boolean) {
    try {
      const booking = await this.bookingModel.findOne({_id});
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const conflicts = accepted ? await this.conflictsFor(booking) : [];

      if (accepted && !force && conflicts.length > 0) {
        this.logger.warn('booking.approval.conflict', {bookingId: _id, actorId: currentActorId(), conflictCount: conflicts.length});
        throw new StructuredHttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            message: 'Booking conflicts with other bookings',
            error: 'Conflict',
            conflicts,
          },
          HttpStatus.CONFLICT
        );
      }

      const updated = await this.bookingModel.findOneAndUpdate(
        {_id},
        {accepted, modifiedBy: currentActorId(), modifiedAt: new Date()},
        {new: true}
      );
      this.logger.log('booking.approved', {bookingId: _id, actorId: currentActorId(), accepted, forced: force});
      return {booking: updated, conflicts};
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      this.logger.error('booking.approval.failed', {bookingId: _id, actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Archives or restores a booking (FR-017).
   *
   * Archiving is a visibility change, not a conflict decision, so it has no guard.
   * The actor and timestamp are recorded with the write (FR-016).
   */
  async setArchive(_id: string, archive: boolean) {
    try {
      const updated = await this.bookingModel.findOneAndUpdate(
        {_id},
        {archive, modifiedBy: currentActorId(), modifiedAt: new Date()},
        {new: true}
      );
      if (!updated) {
        throw new NotFoundException('Booking not found');
      }

      this.logger.log('booking.archived', {bookingId: _id, actorId: currentActorId(), archive});
      return updated;
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      this.logger.error('booking.archive.failed', {bookingId: _id, actorId: currentActorId(), error: errorMessage(e)});
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Lists bookings for a period, at the level of detail the caller is entitled to
   * (FR-020, FR-022, FR-043).
   *
   * `staff` is a parameter rather than something the service infers from the caller, so
   * the scope decision is made once, in the controller, where the authenticated user is
   * available. `resolveBookingListRequest` turns the validated query and the scope into a
   * filter and a page; the public filter is the *filtered* query, not a post-filter of the
   * full result, so FR-005 is enforced at the database and an unaccepted booking is never
   * read in the first place.
   *
   * `total` is a separate `countDocuments` on the same filter, because the contract's
   * `total` is the count *before* pagination and reading a page cannot produce it.
   *
   * The two reads share one filter and run together. The projection is `.lean()`, as
   * backend-conventions §4 requires for a read path that only serialises: hydrating a
   * document per row buys nothing here and the serializer accepts a plain object.
   */
  async findAllBooking(query: BookingQueryDto, staff: boolean) {
    let resolved: ReturnType<typeof resolveBookingListRequest>;
    try {
      resolved = resolveBookingListRequest(query, {staff, now: new Date()});
    } catch (e) {
      if (e instanceof BookingRangeRequiredError) {
        throw new UnprocessableEntityException(e.message);
      }
      throw e;
    }

    const {filter, pagination} = resolved;
    const criteria = buildBookingQuery(filter);
    try {
      const [items, total] = await Promise.all([
        this.bookingModel.find(criteria, null, {
          sort: {createdAt: -1, _id: -1},
          skip: pagination.skip,
          limit: pagination.limit,
          lean: true
        }),
        this.bookingModel.countDocuments(criteria)
      ]);
      return {items, total, page: pagination.page, limit: pagination.limit};
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}
