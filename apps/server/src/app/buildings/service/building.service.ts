import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {Building} from '../schemas/building.schema';
import {Booking} from '../../bookings/schemas/booking.schema';
import {User} from '../../users/schemas/user.schema';
import {BuildingDto, UpdateBuildingDto} from '../models/building.dto';
import {errorMessage, errorStatus} from '../../utility/http-error';

/**
 * The message a refused facility delete carries (T059, FR-010).
 *
 * A facility referenced by a booking or assigned to a staff user is not deleted: the
 * legacy `deleteBuilding` removed the document and left every booking that referenced it
 * orphaned, and the public calendar and booking form would then offer a facility that no
 * longer exists. Deactivation (`PUT /buildings/{_id} {active: false}`) is the supported way
 * to retire a facility.
 */
const BUILDING_IN_USE_MESSAGE =
  'This facility is referenced by a booking or a staff assignment and cannot be deleted. Deactivate it instead (active: false).';

@Injectable()
export class BuildingService {
  constructor(
    @InjectModel('Building') private buildingModel: Model<Building>,
    @InjectModel('Booking') private bookingModel: Model<Booking>,
    @InjectModel('User') private userModel: Model<User>
  ) {}

  async createBuilding(building: BuildingDto) {
    try {
      return await this.buildingModel.create(building);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async updateBuilding(_id: string, building: UpdateBuildingDto) {
    try {
      return await this.buildingModel.updateOne({_id}, building);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Deletes a facility, refusing when a booking or a staff assignment still references it
   * (T059, FR-010).
   *
   * The rule is restrict, not cascade: a booking names the facility by `{place.city,
   * place.place}`, so removing the facility would orphan every booking that points at it and
   * the calendar and reports would name a facility that no longer exists. A `409` names the
   * situation and points at the supported alternative, deactivation.
   *
   * The booking reference is matched on the facility's own `{property, city}` pair — the key
   * the booking stores — rather than on `property` alone, because `property` is unique only
   * *per city* (`hala-sportowa` exists in all four). A staff assignment is matched on the
   * `property` key the user record holds, which carries no city, so that check is a
   * conservative over-approximation: it may refuse a delete when the same `property` exists
   * in another city. Refusing in the safe direction is deliberate — the facility can still be
   * deactivated, whereas an orphaned booking cannot be un-orphaned.
   */
  async deleteBuilding(_id: string) {
    try {
      const facility = await this.buildingModel.findOne({_id}, {property: 1, city: 1});
      if (facility) {
        const bookingReferences = await this.bookingModel.countDocuments({
          'place.place': facility.property,
          'place.city': facility.city,
        });
        const staffAssignments = await this.userModel.countDocuments({buildings: facility.property});
        if (bookingReferences > 0 || staffAssignments > 0) {
          throw new HttpException(BUILDING_IN_USE_MESSAGE, HttpStatus.CONFLICT);
        }
      }
      return await this.buildingModel.deleteOne({_id});
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async findBuilding(_id: string) {
    try {
      return await this.buildingModel.findOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Lists facilities for the calendar, booking form and Facilities tab (FR-007, FR-009).
   *
   * A retired facility (`active: false`, T059) is withheld from the **public** read: the list
   * drives the city/facility selectors the booking form offers, so a deactivated facility must
   * not appear as rentable. Staff still receive it — the Facilities tab shows the record and the
   * Users tab offers it for assignment, so hiding it would make a retired facility invisible and
   * its assignment un-editable. Reactivation is `PUT /buildings/{_id} {active: true}`. The
   * filter is `active: {$ne: false}` rather than
   * `active: true`, so a document written before the field existed (or by a direct driver call
   * that omitted it) reads as active rather than silently disappearing from the calendar.
   */
  async findAllBuildings(includeInactive = false) {
    try {
      const filter = includeInactive ? {} : {active: {$ne: false}};
      return await this.buildingModel.find(filter);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}
