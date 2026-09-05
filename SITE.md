# Portfolio website

The live site at https://aadik1ng.github.io/ is published from the root of the main branch by GitHub Pages. No package installation or build step is needed to serve it.

## Active files

- `index.html`: portfolio content and page structure.
- `styles.css`: responsive styling and transparent Contact layout.
- `main.js`: scrolling, navigation, accessibility, and animation coordination.
- `choreography.js`: the Three.js transformer-network background.
- `my_image.png`: original portrait.
- `assets/vendor/`: Anime.js 4.2.2 and Three.js 0.180.0 browser modules with their MIT licenses. Three.js requires both the module and core files.

The libraries are served from this repository; Google Fonts is optional and has system fallbacks. The site uses no API keys or backend. The `.nojekyll` file ensures GitHub Pages serves these static assets directly.

For local preview, run `python3 -m http.server 4173` from the repository root and open http://localhost:4173/.

Edit the active files above and push to main to publish future changes. Increment the relevant CSS/JavaScript query version in `index.html` (and the choreography import in `main.js` when applicable) after asset changes to avoid stale browser caches. Existing profile assets, workflows, and alternate pages are retained separately.
