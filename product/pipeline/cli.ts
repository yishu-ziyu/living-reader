import { buildWealthOfNationsAssets } from "./build";
import {
  buildBookTranslations,
  createStepFunTranslationBatch,
} from "./translate";

async function main(): Promise<void> {
  const apiKey = process.env.STEPFUN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("STEPFUN_API_KEY is required to build Chinese translations");
  }

  const book = await buildWealthOfNationsAssets();
  const translations = await buildBookTranslations({
    manifest: book.manifest,
    translate: createStepFunTranslationBatch(apiKey),
    model: "step-3.5-flash",
    promptRevision: "cannan-zh-cn-v1",
  });

  console.log(
    JSON.stringify(
      {
        manifestPath: book.manifestPath,
        manifestWritten: book.written,
        ...translations,
      },
      null,
      2,
    ),
  );
}

void main();
