# Orbit Personal System

A 90s-style desktop operating system that runs entirely in the browser: a static site with no server. Everything is drawn into one low-resolution, 16-color framebuffer. Each Orbit pixel is 3×3 screen pixels on desktops and 4×4 on phones (smaller only when the window would be too cramped), and the desktop changes shape with the browser window instead of stretching.

## What's inside

| App | What it does |
|---|---|
| **Desktop** | Icons, Trash, right-click menus, minimize-to-icon, outline zoom animations, a procedural sunset wallpaper |
| **Files** | List and icon views, drag and drop, cut/copy/paste, Trash, import/export, whole-disk backup as .zip |
| **Write** | Word processor: bold/italic/underline, large text, alignment, find and replace, `.WRT`/`.TXT`, HTML export |
| **BASIC** | QBasic-style interpreter and IDE with graphics, sound, files and window apps (`WINDOW`/`BUTTON`/`WAITEVENT`) |
| **Draw** | MacPaint-style painting: 14 tools, dither patterns, FatBits zoom, `.PIC`/PNG, image import reduced to the palette |
| **Calc** | Minimal spreadsheet: values, references, arithmetic formulas, `.CSV` |
| **Browser** | Text-only web browser through a reader proxy, plus built-in `orbit:help` pages |
| **Music** | Chiptune player and editor (music macro language, 3 voices) with a piano-roll view |
| **Config** | Pixel size, wallpaper, animations, sound, clock, proxy settings, disk backup/restore |

Files live in the browser's IndexedDB ("Orbit HD") and never leave the computer unless you export them. The full BASIC reference is in [`docs/orbit-basic.md`](docs/orbit-basic.md).

### How the browser gets around CORS
Browsers block a page from reading other sites directly. Orbit asks a **reader proxy** to fetch each page and return it as Markdown text. The default is `https://r.jina.ai/<url>`, which allows cross-origin requests and is free with rate limits. You can change the proxy address, or add an API key, in Config > Network. If you'd rather not depend on a third party, a ~20-line Cloudflare Worker that fetches a URL and returns its text with `Access-Control-Allow-Origin: *` works as a drop-in proxy.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # full test suite (Vitest)
npm run sanity     # type-check + fast smoke tests (~1s)
npm run build      # static site in dist/
```

`node scripts/shot.mjs <url> <out.png> [w] [h] [dpr] [actions-json]` takes headless screenshots for visual checks (Playwright).

In dev builds the OS object is exposed as `window.orbit` for debugging.

### Layout
```
src/core   display (integer scaling), gfx (indexed drawing), palette, fonts, icons, input, sound, mml
src/ui     widget toolkit: buttons, fields, lists, text area, menus, dialogs, file dialog, tabs
src/wm     window manager, top bar, desktop, wallpaper, splash
src/fs     IndexedDB virtual filesystem, seed files, import/export, disk images, .PIC codec
src/basic  lexer, compiler (to closures), VM (time-sliced), built-ins, screen host, headless runner
src/apps   files, write, basic, draw, calc, browser, music, config, about
src/seed   sample programs, documents, tunes and help pages
```

## Deploying to GitHub Pages
1. Create a GitHub repository and push this project to the `main` branch.
2. In the repository settings, under **Pages**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the sanity checks, builds, and publishes `dist/`. Asset paths are relative, so the site works at `https://<user>.github.io/<repo>/`.
