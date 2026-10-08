/**
 * Navegador para las pruebas: el Chromium de Playwright (npx playwright install chromium).
 * CHROMIUM_PATH permite usar otro ejecutable. Nunca en modo --single-process: con él, varios
 * contextos de navegador comparten mal las cookies y las pruebas de sesión fallan sin razón.
 */
exports.launch = async () => {
  if (process.env.SPARTICUZ) {
    const chromium = require('@sparticuz/chromium').default ?? require('@sparticuz/chromium');
    const { chromium: pw } = require('playwright-core');
    return pw.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'),
      headless: true,
    });
  }
  const { chromium } = require('playwright');
  return chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
};
