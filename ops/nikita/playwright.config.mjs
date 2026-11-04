// Nikita · collaudo con il browser di Uniqaia.
// Due dispositivi: computer (Chromium) e iPhone 13 (WebKit, lo stesso motore di Safari).
// NIKITA_BASE cambia il sito da provare (l'autotest usa una copia locale con guasti simulati).
import { defineConfig, devices } from "@playwright/test";

const BASE = process.env.NIKITA_BASE || "https://uniqaia.com";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.NIKITA_NO_RETRY ? 0 : 1,
  workers: 3,
  outputDir: "risultati/tracce",
  reporter: [["list"], ["json", { outputFile: process.env.NIKITA_REPORT || "risultati/playwright.json" }]],
  use: {
    baseURL: BASE,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    userAgent: undefined,
    extraHTTPHeaders: { "X-Uniqaia-Test": "nikita" },
    // OBBLIGATORIO: con il service worker del sito attivo, WebKit manda le richieste fuori dall'intercettazione
    // e le scritture dei test arriverebbero al database vero (successo il 4/11/2026 al primo collaudo).
    serviceWorkers: "block",
  },
  projects: [
    { name: "computer", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
});
