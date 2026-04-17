import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

async function resolveExecutablePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROME_EXECUTABLE_PATH;
  if (envPath) {
    return envPath;
  }

  return chromium.executablePath();
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: {
      width: 1275,
      height: 1650,
      deviceScaleFactor: 1
    },
    executablePath: await resolveExecutablePath(),
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
