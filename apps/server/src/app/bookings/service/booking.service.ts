import {ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Booking, TBooking} from '../schemas/booking.schema';
import {BookingDto} from '../models/booking.dto';
import {Model} from 'mongoose';
import {Building} from '../../buildings/schemas/building.schema';
import {BookedTime} from '../schemas/booked-time.schema';
import {BookedTimeDto} from '../models/booked-time.dto';
import {BookingQueryDto} from '../models/booking-query.dto';
import {BookingRangeRequiredError, buildBookingQuery, resolveBookingListRequest} from '../list/booking-list';
import {findResolvedSlotViolation, resolvedSlotMessage} from '../slots/resolved-slots';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {StructuredLogger} from '../../logging/structured-logger';
import {currentActorId} from '../../logging/request-context';
import {bookedDays, findConflictingBookingIds, findConflictsWith} from '../conflicts/conflicts';
import {findIntraBookingOverlap} from '../slots/intra-booking-overlap';
import {StructuredHttpException} from '../../config/structured-http-exception';
import {isSizeOffered, SIZE_NOT_OFFERED_MESSAGE} from '../size/size-rule';

@Injectable()
export class BookingService {
  constructor(
    @InjectModel('Booking') private bookingModel: Model<Booking>,
    @InjectModel('Building') private buildingModel: Model<Building>,
    private readonly logger: StructuredLogger
  ) {}

  /**
   * Refuses a size the referenced facility does not offer (FR-031, T052).
   *
   * The rule only applies when the facility resolves. `place.place` is the facility
   * `property` key and `place.city` scopes it, matching the `{city, property}` unique
   * index the buildings schema declares. A booking whose facility is missing is left to
   * T059 (#126), which owns referential integrity: refusing it here would reject
   * legacy-shaped data and every fixture that uses a placeholder facility name, and would
   * report a missing facility as a size error.
   */
  private async assertSizeOffered(size: string, place: {place: string; city: string} | undefined): Promise<void> {
    if (!place?.place) {
      return;
    }
    // The filter is built as a plain record rather than a typed `FilterQuery<Building>`:
    // `city` is a string on the booking but an enum union on the building, and Mongoose's
    // overloads reject the wider type. `buildBookingQuery` builds its filter the same way.
    const filter: Record<string, unknown> = {property: place.place};
    if (place.city !== undefined) {
      filter.city = place.city;
    }
    const facility = await this.buildingModel.findOne(filter, {sizes: 1});
    if (!isSizeOffered(size, facility)) {
      throw new UnprocessableEntityException(SIZE_NOT_OFFERED_MESSAGE);
    }
  }

  /**
   * Creates a booking and stamps its server-owned fields.
   *
   * `createdBy` is taken from the caller rather than the body (FR-016): the controller reads
   * it from the authenticated user, so a body that set it cannot attribute the booking to
   * someone else. `createdAt`/`modifiedAt` default to now on the schema, so they are not
   * set here.
   *
   * `accepted` and `archive` are forced to `false`, never taken from the body (FR-014,
   * FR-017): a booking is created as an unapproved request, and the flags are administrator
   * decisions taken on the approve/archive routes, where the conflict check runs. The DTO no
   * longer declares them, so `whitelist` would already strip them, but the service forces the
   * values as the positive half of the rule — the field is written by this method, and a
   * caller must not be able to influence it through any path.
   *
   * `isPublic` decides the RODO rule (FR-011). The legacy form refused to submit without the
   * acknowledgement; the controller passes `true` only when the request carried no credential
   * (`request.isPublic`). Staff entering a booking on a tenant's behalf are exempt, matching
   * the legacy staff path, which did not collect it. The value is recorded on the booking, so
   * the consent is provable rather than merely required.
   *
   * `extraOptions` is *derived* from `selectedOptions` (data-model.md): it is a stored
   * boolean rather than a virtual because the legacy reporting reads it directly. Computing
   * it here, from the same body the add-ons come from, is what keeps the two from disagreeing
   * — a caller-supplied `extraOptions` would be a second source of truth for the same fact.
   */
  async createBooking(booking: BookingDto, createdBy: string | undefined, isPublic: boolean) {
    if (isPublic && booking.rodoAcknowledgement !== true) {
      this.logger.warn('booking.create.rejected', {actorId: currentActorId(), reason: 'rodo_missing'});
      throw new UnprocessableEntityException('The RODO acknowledgement is required');
    }

    try {
      await this.assertSizeOffered(booking.size, booking.place);
      // An overlap between two slots *of this booking* is a warning, not an error (T053):
      // the legacy form warned ("Niektóre godziny rezerwacji konfliktują ze sobą") and let
      // the request through, and it is a data-quality problem for the office, not a double
      // booking against another tenant. It is recorded so the case is visible; the booking
      // is stored unchanged.
      const overlapDay = findIntraBookingOverlap(booking.bookedTimes ?? []);
      if (overlapDay) {
        this.logger.warn('booking.create.intra_overlap', {day: overlapDay, actorId: currentActorId()});
      }
      const created = await this.bookingModel.create({
        ...booking,
        createdBy,
        accepted: false,
        archive: false,
        extraOptions: (booking.selectedOptions?.length ?? 0) > 0,
      });
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
      // `extraOptions` is derived from `selectedOptions`, so it is never taken from the
      // body: a caller could otherwise set the flag and the add-ons to disagree. When the
      // add-ons change, the flag is recomputed from them here.
      delete updates.extraOptions;
      if (updates.selectedOptions) {
        updates.extraOptions = updates.selectedOptions.length > 0;
      }

      // The size rule is checked against the *effective* pair, not the body alone: a
      // caller may change only the size, only the facility, or both, and each must be
      // validated against the facility that will actually be stored. Reading the record
      // only when the body touches `size` or `place` keeps the check off the common
      // descriptive update.
      if (updates.size !== undefined || updates.place !== undefined) {
        const stored = await this.bookingModel.findOne({_id}, {size: 1, place: 1});
        if (stored) {
          await this.assertSizeOffered(updates.size ?? stored.size, updates.place ?? stored.place);
        }
      }

      // After stripping the fields above an update can be empty — a caller who sent
      // only `accepted`, or the ownership spec's default body. MongoDB rejects an empty
      // update document ("requires at least one atomic operator"), which would surface
      // as a `500` on a request that asked for nothing. A no-op is a success.
      if (Object.keys(updates).length === 0) {
        this.logger.log('booking.updated', {bookingId: _id, actorId: currentActorId(), action: 'none'});
        return {acknowledged: true, matchedCount: 1, modifiedCount: 0};
      }

      // The audit stamp is added only when there is a real change, and after the empty
      // check above: stamping first would make every request look like a change and turn
      // the no-op back into a write (FR-016).
      updates.modifiedBy = currentActorId();
      updates.modifiedAt = new Date();

      const result = await this.bookingModel.updateOne({_id}, updates);
      // The field names are logged, not their values, so a booking's content is not
      // recorded. `accepted`/`archive` are stripped above, so this update can only carry
      // the descriptive fields (a comment, a contact detail); the fixed label keeps a
      // caller from injecting one through a field name.
      this.logger.log('booking.updated', {
        bookingId: _id,
        actorId: currentActorId(),
        action: 'fields',
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

      // The same intra-booking warning as on create (T053): a replacement is the other way
      // a booking's slots are written, and a set that overlaps itself must be flagged here
      // too or the rule would be attached to one route and absent on the other.
      const overlapDay = findIntraBookingOverlap(bookedTimes);
      if (overlapDay) {
        this.logger.warn('booking.booked_times.intra_overlap', {
          bookingId: _id,
          day: overlapDay,
          actorId: currentActorId(),
        });
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
   * The ids of the unaccepted bookings that conflict within one facility and period
   * (FR-015, contracts/openapi.yaml `/bookings/conflicts`).
   *
   * The facility and the period are pushed into the query rather than filtered after the
   * read, for the same reason the public calendar filter is: an unrelated booking is
   * never loaded. The period is expressed as a range over the slot days
   * (`bookedTimes.day`), not over the stored `month` scalar (T054): the scalar is derived
   * from the first slot, so scoping by it would miss a booking whose slots straddle a
   * month boundary — the exact blind spot this task closes.
   *
   * The comparison itself lives in the pure `findConflictingBookingIds`, which is
   * where the rules and their SC-002 oracle are. This method only shapes the query
   * and adapts the documents to what that function reads.
   */
  async findConflictingBookingIds(city: string, building: string, from: Date, to: Date): Promise<string[]> {
    try {
      const bookings = await this.bookingModel.find({
        'place.city': city,
        'place.place': building,
        'bookedTimes.day': {$gte: from, $lte: to},
      });

      // `_id` on a hydrated document is an `ObjectId`, not the `string` the pure
      // function declares, so it is converted here rather than hidden behind a cast.
      // The module compares ids for identity and returns them; handing it an
      // `ObjectId` would make the returned "ids" serialize as hex strings by accident
      // and the identity test depend on reference equality (T017's trap).
      return findConflictingBookingIds(
        bookings.map((booking) => ({
          _id: String(booking._id),
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
   * Scoped to the booking's own facility and to the exact days its slots fall on
   * (`bookedTimes.day: {$in: ...}`), not to its stored `month` (T054). The day set is
   * what the rule actually compares, and a booking whose slots straddle a month
   * boundary contributes a day to each month, so both sides of the boundary are loaded.
   * `String(_id)` on the record and on every candidate keeps the comparison in the
   * `string` domain the pure function declares; passing an `ObjectId` would make the
   * identity test depend on reference equality.
   *
   * The booking is passed in rather than looked up again, so an approval does not
   * read the same document twice.
   */
  private async conflictsFor(booking: TBooking): Promise<string[]> {
    const days = bookedDays({_id: String(booking._id), accepted: booking.accepted, bookedTimes: booking.bookedTimes});
    const candidates = await this.bookingModel.find({
      'place.city': booking.place.city,
      'place.place': booking.place.place,
      'bookedTimes.day': {$in: days},
    });

    const asConflict = (record: {_id: unknown; accepted: boolean; bookedTimes: BookedTime[]}) => ({
      _id: String(record._id),
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
