import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const browserDirectory = resolve(import.meta.dirname, '../dist/browser');
const indexSource = resolve(browserDirectory, 'index.js');
const engagementSource = resolve(browserDirectory, 'engagement.js');
const chatWidgetSource = resolve(browserDirectory, 'chat-widget.js');
const callWidgetSource = resolve(browserDirectory, 'call-widget.js');
const packageBundle = resolve(import.meta.dirname, '../dist/index.global.js');
const destinationDirectory = resolve(import.meta.dirname, '../../../apps/platform/public/sdk');
const destination = resolve(destinationDirectory, 'tracker.js');

const [engagementModule, chatWidgetModule, callWidgetModule, indexModule] = await Promise.all([
  readFile(engagementSource, 'utf8'),
  readFile(chatWidgetSource, 'utf8'),
  readFile(callWidgetSource, 'utf8'),
  readFile(indexSource, 'utf8'),
]);
const browserBundle = `(function () {
  const modules = {};
  const cache = {};
  const require = (name) => {
    if (cache[name]) return cache[name].exports;
    const module = { exports: {} };
    cache[name] = module;
    const factory = modules[name];
    if (!factory) throw new Error('Unknown tracker module: ' + name);
    factory(require, module.exports);
    return module.exports;
  };
  modules['./engagement'] = (require, exports) => {
${engagementModule}
  };
  modules['./chat-widget'] = (require, exports) => {
${chatWidgetModule}
  };
  modules['./call-widget'] = (require, exports) => {
${callWidgetModule}
  };
  modules['./index'] = (require, exports) => {
${indexModule}
  };
  require('./index');
})();
`;

await mkdir(destinationDirectory, { recursive: true });
await writeFile(packageBundle, browserBundle, 'utf8');
await writeFile(destination, browserBundle, 'utf8');
