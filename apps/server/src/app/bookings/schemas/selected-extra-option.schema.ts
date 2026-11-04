import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {ISelectedExtraOption} from '@models/selected-extra-option.model';

/**
 * A lighting / sanitary add-on for a booked time (data-model.md `SelectedExtraOption`,
 * legacy `ISelectedExtraOptions`).
 *
 * `options` is stored as a list of single-key objects (`{lights: true}` or `{toilets: true}`)
 * rather than two booleans, matching the shared model and the legacy form: a facility is
 * recorded with lights, toilets or both without a second field that could fall out of sync.
 * It is typed `Array<Object>` so the driver keeps each entry's shape instead of flattening it
 * to a scalar.
 *
 * `_id: false` because this is an embedded value, not a collection of its own: an id per
 * add-on would be an identifier nothing ever references.
 */
@Schema({_id: false})
export class SelectedExtraOption implements ISelectedExtraOption {
  @Prop({
    type: [Object],
    required: [true, 'Please add at least one extra option']
  })
  options!: ISelectedExtraOption['options'];

  @Prop({
    type: Date,
    required: [true, 'Please pick the extra option start hour']
  })
  fromHour!: Date;

  @Prop({
    type: Date,
    required: [true, 'Please pick the extra option end hour']
  })
  toHour!: Date;
}

export const SelectedExtraOptionSchema = SchemaFactory.createForClass(SelectedExtraOption);
