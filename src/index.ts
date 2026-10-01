import { AutoMapper, createMapper } from "./mapper";

/** Shared mapper instance for apps that only need one. */
const mapper = new AutoMapper();

export { AutoMapper, createMapper, mapper };
export type {
  AfterMapFn,
  AutoMapMode,
  BeforeMapFn,
  Constructor,
  ConvertFn,
  MapKey,
  MapOptions,
  MappingBuilder,
  MemberOptions,
} from "./types";
export default mapper;
