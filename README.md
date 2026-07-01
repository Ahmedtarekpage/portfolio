# Ahmed Tarek Mourssi — Portfolio

A 3D-animated, dark-futuristic portfolio site (Three.js + vanilla JS/CSS). No build step.

## Run locally
The site uses ES modules + an import map, so it must be served over HTTP (not opened as a file).

```bash
cd portfolio
python3 -m http.server 5173
# then open http://localhost:5173
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

## Deploy (free)
Drag the `portfolio/` folder onto **Netlify Drop** (app.netlify.com/drop) or **Vercel**, or push to a
GitHub repo and enable **GitHub Pages**. It's fully static.

## Files
- `index.html` — structure & content
- `styles.css` — theme, layout, animations
- `main.js` — resume data, scroll reveals, count-ups, custom cursor, and the Three.js background scene

## Editing content
All resume content (jobs, skills, stats) lives at the top of `main.js` (`JOBS`, `SKILLS`) and in the
hero/contact blocks of `index.html`. Edit those to update the site.

> Note: Three.js loads from a CDN (unpkg), so an internet connection is needed the first time. To go
> fully offline, download `three.module.js` locally and point the import map at it.
