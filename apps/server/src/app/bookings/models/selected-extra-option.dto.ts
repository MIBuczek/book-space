import * as Validator from 'class-validator';
import {ISelectedExtraOption} from '@models/selected-extra-option.model';

/**
 * One lighting / sanitary add-on in a booking body (contracts/openapi.yaml
 * `SelectedExtraOption`, data-model.md `selectedOptions`).
 *
 * `options` is a list of single-key objects (`{lights: true}` or `{toilets: true}`), so a
 * facility is recorded with lights, toilets or both without a second boolean field to keep
 * in sync — the same shape the shared model and the legacy form use.
 *
 * A concrete class rather than an inline type so `@ValidateNested` has a metatype to
 * instantiate; `@Type` is what turns each plain object in the array into one, without which
 * `@ValidateNested` sees an `Object` and validates nothing.
 */
export class SelectedExtraOptionDto implements ISelectedExtraOption {
  @Validator.IsArray({
    message: 'Selected option needs a list of add-ons.'
  })
  @Validator.ArrayMinSize(1, {
    message: 'At least one add-on need to be selected.'
  })
  options!: ISelectedExtraOption['options'];

  @Validator.IsDate({
    message: 'From hour need to be a Date type.'
  })
  fromHour!: Date;

  @Validator.IsDate({
    message: 'To hour need to be a Date type.'
  })
  toHour!: Date;
}
