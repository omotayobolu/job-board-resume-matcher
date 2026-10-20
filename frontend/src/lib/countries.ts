import { countries } from "countries-list";

/** Country names in alphabetical order, as stored in the `location` columns. */
export const COUNTRY_NAMES: readonly string[] = Object.values(countries)
  .map((country) => country.name)
  .sort((a, b) => a.localeCompare(b));
