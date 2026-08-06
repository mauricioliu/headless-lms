// Compile-time drift checks: a table's row type must carry exactly the fields
// of its domain type from @headless-lms/types/schemas. A row field may be wider
// than the domain's (opaque jsonb, generated text) but never narrower, missing,
// or extra. On drift, the check resolves to the offending keys.
export type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type FieldDrifts<R, D> = Eq<R, D> extends true ? false : [D] extends [R] ? false : true;

type DriftKeys<Row, Domain> = {
  [K in keyof Row | keyof Domain]: K extends keyof Row
    ? K extends keyof Domain
      ? FieldDrifts<Row[K], Domain[K]> extends true
        ? K
        : never
      : K
    : K;
}[keyof Row | keyof Domain];

export type NoDrift<Row, Domain> = [DriftKeys<Row, Domain>] extends [never]
  ? true
  : DriftKeys<Row, Domain>;

export type Expect<T extends true> = T;
