import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve(import.meta.dirname, '../dist/browser/index.js');
const destinationDirectory = resolve(import.meta.dirname, '../../../apps/platform/public/sdk');
const destination = resolve(destinationDirectory, 'tracker.js');

const umdBundle = await readFile(source, 'utf8');
const browserBundle = umdBundle.replace(
  /\n    else if \(typeof define === "function" && define\.amd\) \{\n        define\(\["require", "exports"\], factory\);\n    \}/,
  '\n    else {\n        factory(undefined, {});\n    }',
);

if (browserBundle === umdBundle) {
  throw new Error('The tracker browser wrapper could not be generated.');
}

await mkdir(destinationDirectory, { recursive: true });
await writeFile(destination, browserBundle, 'utf8');
