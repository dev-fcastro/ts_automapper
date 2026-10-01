import type {
  AfterMapFn,
  AutoMapMode,
  BeforeMapFn,
  ConvertFn,
  MapKey,
  MapOptions,
  MappingBuilder,
  MemberOptions,
} from "./types";

type AnyRecord = Record<PropertyKey, unknown>;

interface MemberConfig {
  ignore?: boolean;
  mapFrom?: ((source: unknown) => unknown) | string;
  condition?: (source: unknown) => boolean;
  hasNullSubstitute?: boolean;
  nullSubstitute?: unknown;
  mapWith?: { from: MapKey; to: MapKey; selector?: (source: unknown) => unknown };
}

interface Mapping {
  from: MapKey<any>;
  to: MapKey<any>;
  autoMap: AutoMapMode;
  members: Map<string, MemberConfig>;
  before: BeforeMapFn<unknown>[];
  after: AfterMapFn<unknown, unknown>[];
  convert?: ConvertFn<unknown, unknown>;
}

function describeKey(key: MapKey): string {
  if (typeof key === "function") return key.name || "<anonymous class>";
  return String(key);
}

function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (current == null) return undefined;
    current = (current as AnyRecord)[part];
  }
  return current;
}

class MemberOptionsImpl implements MemberOptions<any, any, any> {
  constructor(private readonly config: MemberConfig) {}

  mapFrom(selector: ((source: any) => unknown) | string): this {
    this.config.mapFrom = selector;
    return this;
  }

  ignore(): this {
    this.config.ignore = true;
    return this;
  }

  condition(predicate: (source: any) => boolean): this {
    this.config.condition = predicate;
    return this;
  }

  nullSubstitute(value: unknown): this {
    this.config.hasNullSubstitute = true;
    this.config.nullSubstitute = value;
    return this;
  }

  mapWith(from: MapKey, to: MapKey, selector?: (source: any) => unknown): this {
    this.config.mapWith = { from, to, selector };
    return this;
  }
}

class MappingBuilderImpl<TSource, TDest> implements MappingBuilder<TSource, TDest> {
  constructor(
    private readonly mapper: AutoMapper,
    private readonly mapping: Mapping
  ) {}

  forMember<K extends keyof TDest & string>(
    member: K,
    configure: (options: MemberOptions<TSource, TDest, K>) => unknown
  ): this {
    const config: MemberConfig = {};
    configure(new MemberOptionsImpl(config));
    this.mapping.members.set(member, config);
    return this;
  }

  beforeMap(fn: BeforeMapFn<TSource>): this {
    this.mapping.before.push(fn as BeforeMapFn<unknown>);
    return this;
  }

  afterMap(fn: AfterMapFn<TSource, TDest>): this {
    this.mapping.after.push(fn as AfterMapFn<unknown, unknown>);
    return this;
  }

  convertUsing(fn: ConvertFn<TSource, TDest>): this {
    this.mapping.convert = fn as ConvertFn<unknown, unknown>;
    return this;
  }

  reverseMap(): MappingBuilder<TDest, TSource> {
    return this.mapper.createMap<TDest, TSource>(this.mapping.to, this.mapping.from, {
      autoMap: this.mapping.autoMap,
    });
  }
}

export class AutoMapper {
  private readonly mappings = new Map<MapKey, Map<MapKey, Mapping>>();

  /**
   * Register a mapping between two keys (classes, strings or symbols).
   * Types are inferred from classes; pass them explicitly for strings and symbols.
   */
  createMap<TSource, TDest>(
    from: MapKey<TSource>,
    to: MapKey<TDest>,
    options?: MapOptions
  ): MappingBuilder<TSource, TDest>;
  /** Register a mapping that is fully handled by `fn` (same as `convertUsing`). */
  createMap<TSource, TDest>(
    from: MapKey<TSource>,
    to: MapKey<TDest>,
    fn: ConvertFn<TSource, TDest>
  ): MappingBuilder<TSource, TDest>;
  createMap<TSource, TDest>(
    from: MapKey<TSource>,
    to: MapKey<TDest>,
    optionsOrFn?: MapOptions | ConvertFn<TSource, TDest>
  ): MappingBuilder<TSource, TDest> {
    const options = typeof optionsOrFn === "function" ? {} : optionsOrFn ?? {};
    const mapping: Mapping = {
      from,
      to,
      autoMap: options.autoMap ?? "source",
      members: new Map(),
      before: [],
      after: [],
    };

    if (mapping.autoMap === "destination" && typeof to !== "function") {
      throw new Error(
        `autoMap "destination" requires a class as destination (got "${describeKey(to)}")`
      );
    }

    let byTarget = this.mappings.get(from);
    if (!byTarget) {
      byTarget = new Map();
      this.mappings.set(from, byTarget);
    }
    byTarget.set(to, mapping);

    const builder = new MappingBuilderImpl<TSource, TDest>(this, mapping);
    if (typeof optionsOrFn === "function") builder.convertUsing(optionsOrFn);
    return builder;
  }

  /** Apply every registration in `profile` to this mapper. */
  addProfile(profile: (mapper: this) => void): this {
    profile(this);
    return this;
  }

  hasMap(from: MapKey, to: MapKey): boolean {
    return this.mappings.get(from)?.has(to) ?? false;
  }

  /** Map `source`. `null` and `undefined` are returned as-is. */
  map<TSource, TDest>(from: MapKey<TSource>, to: MapKey<TDest>, source: TSource): TDest {
    const mapping = this.getMapping(from, to);
    if (source == null) return source as unknown as TDest;
    return this.execute(mapping, source) as TDest;
  }

  mapArray<TSource, TDest>(
    from: MapKey<TSource>,
    to: MapKey<TDest>,
    sources: readonly TSource[]
  ): TDest[] {
    return sources.map((source) => this.map<TSource, TDest>(from, to, source));
  }

  private getMapping(from: MapKey, to: MapKey): Mapping {
    const mapping = this.mappings.get(from)?.get(to);
    if (!mapping) {
      throw new Error(
        `No mapping registered from "${describeKey(from)}" to "${describeKey(to)}"`
      );
    }
    return mapping;
  }

  private execute(mapping: Mapping, source: unknown): unknown {
    if (mapping.convert) return mapping.convert(source);

    for (const fn of mapping.before) fn(source);

    const src = source as AnyRecord;
    const dest = (
      typeof mapping.to === "function" ? new mapping.to() : {}
    ) as AnyRecord;

    const autoKeys =
      mapping.autoMap === "source"
        ? Object.keys(src)
        : mapping.autoMap === "destination"
          ? Object.keys(dest).filter((key) => key in src)
          : [];

    for (const key of autoKeys) {
      if (!mapping.members.has(key)) dest[key] = src[key];
    }

    for (const [key, config] of mapping.members) {
      if (config.ignore) continue;
      if (config.condition && !config.condition(source)) continue;

      let value: unknown;
      if (config.mapWith?.selector) value = config.mapWith.selector(source);
      else if (typeof config.mapFrom === "string") value = getPath(source, config.mapFrom);
      else if (config.mapFrom) value = config.mapFrom(source);
      else value = src[key];

      if (config.mapWith && value != null) {
        const { from, to } = config.mapWith;
        value = Array.isArray(value) ? this.mapArray(from, to, value) : this.map(from, to, value);
      }

      if (value == null && config.hasNullSubstitute) value = config.nullSubstitute;

      dest[key] = value;
    }

    for (const fn of mapping.after) fn(source, dest);

    return dest;
  }
}

/** Create an isolated mapper instance. */
export function createMapper(): AutoMapper {
  return new AutoMapper();
}
