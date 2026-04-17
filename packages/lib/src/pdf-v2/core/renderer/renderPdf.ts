import "server-only";

async function resolveExecutablePath(chromium: {
  executablePath: () => Promise<string>;
}) {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROME_EXECUTABLE_PATH;
  if (envPath) {
    return envPath;
  }

  return chromium.executablePath();
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("puppeteer-core")
  ]);
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: {
      width: 1275,
      height: 1650,
      deviceScaleFactor: 1
    },
    executablePath: await resolveExecutablePath(chromium),
    headless: true
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0.45in",
        right: "0.55in",
        bottom: "0.55in",
        left: "0.55in"
      }
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
