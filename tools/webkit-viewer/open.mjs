// Opens the app in a window of WebKit (the engine of Safari, and of the Mac version of the app).
// usage: node open.mjs [url]     (default http://127.0.0.1:5174/ - the address start-dev.bat serves the app at)
import { webkit } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:5174/'

try {
  await fetch(url)
} catch {
  console.log(`Nothing answers at ${url}.`)
  console.log('Start the app first (start-dev.bat in the project folder), keep its window open, and run this again.')
  process.exit(1)
}

const browser = await webkit.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(url)
console.log(`The app is open in WebKit at ${url}. Close its window to finish.`)
browser.on('disconnected', () => process.exit(0))
await new Promise(() => {})
