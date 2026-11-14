import {cityLabel, distinctCities, IBuilding, IPublicBuilding} from '@models/building.model';
import {ISelectOption} from '../shared/ui';

/**
 * The city selector's options, derived from the facilities a screen already fetched.
 *
 * Cities are data, not a compiled-in list (spec.md §9 open question 1, FR-007): the options are
 * the distinct `city` values across the facilities, so an administrator adds a city by adding a
 * facility that names it and it appears in every selector on the next read. The label is
 * `cityLabel`, which prettifies the sample slugs and otherwise shows the value as typed.
 *
 * One helper rather than a copy per screen, because five screens render a city selector and a
 * copy per screen is exactly the drift the shared model exists to prevent.
 */
const cityOptions = (buildings: readonly (IBuilding | IPublicBuilding)[]): ISelectOption[] =>
  distinctCities(buildings).map((city) => ({value: city, label: cityLabel(city)}));

/**
 * The value a selector keeps when its option list changes.
 *
 * A city or facility the previous choice still names is kept, so a background refresh does not
 * reset a choice the user already made; otherwise the list's first value is selected, or `''`
 * when the list is empty. This is the `computation` a `linkedSignal` on the option list wants,
 * factored out so the five selectors cannot disagree on the rule.
 */
const keepSelected = (options: ISelectOption[], previous: string | undefined): string => {
  if (previous !== undefined && options.some((option) => option.value === previous)) {
    return previous;
  }
  return options[0]?.value ?? '';
};

export {cityOptions, keepSelected};
