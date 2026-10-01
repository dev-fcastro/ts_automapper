/** Any class that can be instantiated with `new`. */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** Identifies one side of a mapping: a class, a string or a symbol. */
export type MapKey<T = unknown> = string | symbol | Constructor<T>;

/**
 * How members that are not configured with `forMember` are handled.
 * - `"source"`: copy every own enumerable property of the source (default).
 * - `"destination"`: copy only the properties that exist on a fresh instance
 *   of the destination class.
 * - `"none"`: only copy members configured with `forMember`.
 */
export type AutoMapMode = "source" | "destination" | "none";

export interface MapOptions {
  autoMap?: AutoMapMode;
}

export type ConvertFn<TSource, TDest> = (source: TSource) => TDest;
export type BeforeMapFn<TSource> = (source: TSource) => void;
export type AfterMapFn<TSource, TDest> = (source: TSource, destination: TDest) => void;

export interface MemberOptions<TSource, TDest, K extends keyof TDest> {
  /** Resolve the value with a function or a dotted path on the source (`"customer.name"`). */
  mapFrom(selector: ((source: TSource) => TDest[K]) | string): this;
  /** Never write this member. */
  ignore(): this;
  /** Write this member only when the predicate returns `true`. */
  condition(predicate: (source: TSource) => boolean): this;
  /** Use `value` when the resolved value is `null` or `undefined`. */
  nullSubstitute(value: TDest[K]): this;
  /** Map the resolved value (object or array) with another registered mapping. */
  mapWith(from: MapKey, to: MapKey, selector?: (source: TSource) => unknown): this;
}

export interface MappingBuilder<TSource, TDest> {
  forMember<K extends keyof TDest & string>(
    member: K,
    configure: (options: MemberOptions<TSource, TDest, K>) => unknown
  ): this;
  beforeMap(fn: BeforeMapFn<TSource>): this;
  afterMap(fn: AfterMapFn<TSource, TDest>): this;
  /** Replace the whole mapping with a custom function. */
  convertUsing(fn: ConvertFn<TSource, TDest>): this;
  /** Register the opposite mapping (by convention) and return its builder. */
  reverseMap(): MappingBuilder<TDest, TSource>;
}
