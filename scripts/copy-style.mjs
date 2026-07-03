import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

await mkdir(resolve("dist"), { recursive: true });
await copyFile(resolve("src/style.css"), resolve("dist/style.css"));
