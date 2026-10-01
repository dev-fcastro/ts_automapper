// ESM entry: re-exports the CommonJS build so `import mapper from "@fcastro_dev/ts_automapper"` works.
import cjs from "./index.js";

export const { AutoMapper, createMapper, mapper } = cjs;
export default cjs.mapper;
