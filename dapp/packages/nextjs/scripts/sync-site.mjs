/** site/ and design/kit/ are authoritative; all outputs here are disposable. */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(app, "../../..");
const read = name => readFile(path.join(root, name), "utf8");
const write = async (name, data) => {
  const target = path.join(app, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
};
const copy = async (from, to) => {
  await mkdir(path.dirname(path.join(app, to)), { recursive: true });
  await copyFile(path.join(root, from), path.join(app, to));
};
const source = await read("site/index.html");
const body = source
  .match(/<body[^>]*>([\s\S]*?)<\/body>/)[1]
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  .replaceAll("../design/kit/", "/kit/")
  .replaceAll("../design/screens/", "/screens/")
  .replaceAll("https://tocsin-eth.vercel.app/demo", "/demo")
  .replaceAll('href="claim.html"', 'href="/claim"');
const title = source.match(/<title>(.*?)<\/title>/)[1];
const meta = name => source.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))[1];
const metadata = {
  title: { absolute: title },
  description: meta("description"),
  alternates: { canonical: source.match(/rel="canonical" href="([^"]*)"/)[1] },
  openGraph: { title: meta("og:title"), description: meta("og:description"), images: [meta("og:image")] },
  twitter: { card: meta("twitter:card"), title, images: [meta("og:image")] },
};
await write("app/_generated/landing.json", JSON.stringify({ body, metadata }));
await write("styles/landing.css", (await read("site/style.css")).replace(/^@import[^\n]*\n/, ""));
await write("styles/scenes.css", await read("design/kit/scenes.css"));
await write(
  "styles/tokens.css",
  (await read("design/kit/tokens.css")).replace(
    /@import[^\n]*/,
    (await read("site/fonts/fonts.css")).replaceAll("url('", "url('/fonts/"),
  ),
);
for (const name of ["ringfield.js", "mark.svg"]) await copy(`design/kit/${name}`, `public/kit/${name}`);
// Other kit sheets auto-mount scenes. React owns scene cleanup, so omit only that call.
await write(
  "public/kit/scenes.js",
  (await read("design/kit/scenes.js")).replace(/  document\.querySelectorAll\('\[data-scene\]'\)\.forEach[^\n]*\n/, ""),
);
for (const name of ["trust.js", "landing.js"]) await copy(`site/${name}`, `public/kit/${name}`);
for (const name of ["InterVariable.woff2", "JetBrainsMono-400.woff2", "JetBrainsMono-500.woff2"])
  await copy(`site/fonts/${name}`, `public/fonts/${name}`);
for (const name of ["snap-block.jpg", "kohaku-swap-block.jpg", "kohaku-theft-warn.jpg"])
  await copy(`design/screens/raw/${name}`, `public/screens/raw/${name}`);
for (const [from, to] of [
  ["design/screens/cover-1280x720.png", "og.png"],
  ["design/screens/logo-512.png", "icon-512.png"],
  ["design/kit/favicon.svg", "favicon.svg"],
])
  await copy(from, `public/${to}`);
console.log("Synced canonical site content, styles, scripts and assets.");
