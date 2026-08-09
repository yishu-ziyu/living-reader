import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateBookManifestV2,
  type BookManifestV2,
} from "../src/modules/book/domain";
import { ingestWealthOfNations } from "./ingest";

export type BuildWealthOfNationsAssetsOptions = {
  sourceDir?: string;
  outputDir?: string;
};

export async function buildWealthOfNationsAssets(
  options: BuildWealthOfNationsAssetsOptions = {},
): Promise<{
  manifest: BookManifestV2;
  manifestPath: string;
  written: boolean;
}> {
  const manifest = await ingestWealthOfNations({ sourceDir: options.sourceDir });
  const valid = validateBookManifestV2(manifest);
  if (!valid.ok) throw valid.error;
  const outputDir =
    options.outputDir ??
    path.join(process.cwd(), "public/books/wealth-of-nations");
  const manifestPath = path.join(outputDir, "manifest.json");
  await mkdir(outputDir, { recursive: true });
  const written = await writeJsonIfChanged(manifestPath, manifest);
  return { manifest, manifestPath, written };
}

export async function validateManifestAsset(
  manifestPath: string,
): Promise<BookManifestV2> {
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  const valid = validateBookManifestV2(raw);
  if (!valid.ok) throw valid.error;
  return valid.value;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJsonIfChanged(
  destination: string,
  value: unknown,
): Promise<boolean> {
  const next = stableJson(value);
  try {
    if ((await readFile(destination, "utf8")) === next) return false;
  } catch {
    // Missing destination is the normal first build.
  }

  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, next, { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return true;
}
