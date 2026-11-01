/**
 * An add-on requested for a booked time. `options` is a list of single-key
 * objects so a facility can be recorded with lights, toilets or both without a
 * second boolean field to keep in sync.
 */
interface ISelectedExtraOption {
  options: Array<{lights: true} | {toilets: true}>;
  fromHour: Date;
  toHour: Date;
}

export {ISelectedExtraOption};
