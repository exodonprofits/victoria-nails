# Victoria Nails Website

Website source for Victoria Nails, including service pages, gallery, booking widgets, gift cards, and optional AI receptionist proxy.

## Website

The public website is primarily static HTML, CSS and JavaScript. `index.html` is the entry page. Keep the existing relative paths and `images/` directory intact when deploying to a static web host.

To preview locally, run a static file server from the repository root, for example `python -m http.server 8000`, then open `http://localhost:8000`. Some integrations may require their own live services.

## AI receptionist backend (optional)

`server.js` is a separate Node.js HTTP proxy listening on port 9998. It requires an OpenAI API key. Do **not** commit your key to GitHub.

1. Install Node.js 18 or newer.
2. Set the `OPENAI_API_KEY` environment variable securely on the backend host. The `.env.example` file documents the variable but the server does not automatically load `.env`.
3. Run `npm start`.
4. Configure the frontend's backend endpoint and production CORS/network security before public deployment.

**Security warning:** The included proxy is a legacy prototype with permissive CORS, no authentication or rate limiting, and minimal request validation. Do not expose it publicly without hardening it first. Review the AI receptionist's hours, address, pricing and booking information before use.

## Deployment and integrations

- Static site: deploy the repository root to a static web host. GitHub Pages can host static files but **cannot run `server.js`**.
- Backend: deploy separately to a Node.js-compatible host and configure a secret environment variable.
- External booking, gift-card, dashboard and automation integrations may require credentials, endpoints or third-party services. Test these before going live.
- Two AI receptionist workflow JSON exports were excluded from this GitHub package because automated scanning flagged possible credential-like values. Review and sanitize the originals privately before adding them to any repository.

## Files

- `index.html` — homepage
- `services.html`, `about.html`, `gallery.html`, `contact.html`, `reviews.html` — core pages
- `booking.html`, `booking-widget.js`, `sg-widget.js` — booking components
- `styles.css`, `scripts.js`, `images/` — styling and assets
- `server.js` — optional AI receptionist backend

## GitHub upload

Create a new GitHub repository, then upload the **contents** of this folder (not the ZIP itself) or use GitHub Desktop to publish the folder. Review secrets and private operational information before selecting Public visibility.
