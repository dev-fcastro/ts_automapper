import { copyFileSync } from "node:fs";

for (const file of ["index.mjs", "index.d.mts"]) {
  copyFileSync(new URL(`../esm/${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
