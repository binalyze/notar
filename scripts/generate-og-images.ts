import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const WEB_DIR = resolve(ROOT, "packages/web/src");

const FONT_REGULAR_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf";
const FONT_BOLD_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf";

const BRAND_BLUE = "#3b82f6";
const BG_COLOR = "#020202";

interface OGConfig {
  title: string;
  description: string;
  hero: string;
}

interface ImageSpec {
  filename: string;
  width: number;
  height: number;
  outDir?: string;
  scale?: number;
}

const IMAGE_SPECS: ImageSpec[] = [
  { filename: "og-facebook.png", width: 1200, height: 630 },
  { filename: "og-linkedin.png", width: 1200, height: 627 },
  { filename: "og-twitter.png", width: 1200, height: 628 },
  { filename: "github-header.png", width: 800, height: 280, outDir: "assets", scale: 0.6 },
];

function loadConfig(): OGConfig {
  const raw = readFileSync(resolve(WEB_DIR, "public/config.json"), "utf-8");
  const config = JSON.parse(raw);
  return config.og as OGConfig;
}

function toDataUri(svgPath: string): string {
  const svg = readFileSync(svgPath, "utf-8");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function fetchFont(url: string): Promise<Buffer> {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

function buildVdom(og: OGConfig, notarLogoUri: string, scale = 1) {
  const s = (v: number) => Math.round(v * scale);
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BG_COLOR,
        padding: `${s(60)}px`,
      },
      children: [
        {
          type: "img",
          props: {
            src: notarLogoUri,
            width: s(480),
            height: s(121),
            style: { objectFit: "contain" },
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              gap: `${s(12)}px`,
              fontSize: s(42),
              fontWeight: 700,
              textAlign: "center",
              letterSpacing: "-0.02em",
              marginTop: `${s(36)}px`,
            },
            children: og.hero.split(" ").map((word, i, arr) => ({
              type: "span",
              props: {
                style: {
                  color: i === arr.length - 1 ? BRAND_BLUE : "#ffffff",
                },
                children: word,
              },
            })),
          },
        },
        {
          type: "div",
          props: {
            style: {
              fontSize: s(20),
              color: "#a1a1aa",
              textAlign: "center",
              maxWidth: `${s(700)}px`,
              marginTop: `${s(24)}px`,
            },
            children: og.description,
          },
        },
      ],
    },
  };
}

async function generateImage(
  spec: ImageSpec,
  og: OGConfig,
  notarLogoUri: string,
  fonts: { regular: Buffer; bold: Buffer },
) {
  const vdom = buildVdom(og, notarLogoUri, spec.scale);
  const svg = await satori(vdom, {
    width: spec.width,
    height: spec.height,
    fonts: [
      { name: "Inter", data: fonts.regular, weight: 400, style: "normal" as const },
      { name: "Inter", data: fonts.bold, weight: 700, style: "normal" as const },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: spec.width } });
  const png = resvg.render().asPng();
  const outDir = spec.outDir ? resolve(ROOT, spec.outDir) : resolve(WEB_DIR, "public");
  writeFileSync(resolve(outDir, spec.filename), png);
  console.log(`Generated ${spec.filename} (${spec.width}x${spec.height})`);
}

async function main() {
  const og = loadConfig();
  const notarLogoUri = toDataUri(resolve(WEB_DIR, "assets/logo-light.svg"));

  console.log("Downloading fonts...");
  const [regular, bold] = await Promise.all([
    fetchFont(FONT_REGULAR_URL),
    fetchFont(FONT_BOLD_URL),
  ]);
  console.log("Fonts loaded.");

  for (const spec of IMAGE_SPECS) {
    await generateImage(spec, og, notarLogoUri, { regular, bold });
  }

  console.log("All images generated!");
}

main().catch(console.error);
