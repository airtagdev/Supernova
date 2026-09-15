# Supernova

A restrained, dark browser portal built with Node.js, Fastify and Mercury Workshop Scramjet. Includes a centered search page, JSON game library, saved tab appearance and search preferences, and a collapsible Home/Reload toolbar shared by websites and games.

## Run locally

Requires Node.js 22+ and pnpm 10.18.3.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

Open http://localhost:8080. Run `pnpm test` for URL routing tests and `pnpm check` for syntax checks.

## Railway / Docker

Connect this repository to Railway and deploy the `main` branch. The Dockerfile and railway.json configure the service; no database or volume is required. Enable a public HTTPS domain. The server binds to `0.0.0.0` and Railway's `PORT`; `/health` returns HTTP 200. The host must support persistent WebSockets. A static-only deployment is insufficient.

```sh
docker build -t supernova .
docker run --rm -p 8080:8080 supernova
```

Future pushes to the deployment branch can trigger automatic builds in your hosting provider.

## Games

Edit `public/games.json`:

```json
[
  {
    "name": "Example Game",
    "icon": "/icons/example.webp",
    "link": "/games/example/index.html"
  },
  {
    "name": "External Game",
    "icon": "https://example.com/icon.png",
    "link": "https://example.com/game"
  }
]
```

Place local game files in `public/games/`. Local games load directly; external games use Scramjet. The catalog starts empty. Only add content you have permission to host. The library fits ten tiles on wide screens, with centered incomplete rows and fewer columns on smaller screens. Remote icons need CORS support under cross-origin isolation; host icons locally for best reliability. Missing images use the app icon.

## Settings

Tab title, favicon, search engine and toolbar state are stored in this browser's localStorage. DuckDuckGo is the default engine. Uploaded favicon data stays in this browser. The content view preserves the outer app tab appearance.

## Architecture and limitations

The lightweight frontend uses native ES modules without a framework/build step. Scramjet is loaded on first browsing use. The server serves the frontend, bundled Scramjet binaries, BareMux and libcurl transport, and the same-origin `/wisp/` WebSocket endpoint. Cross-origin isolation headers support the proxy transport. Proxy packages are locked in pnpm-lock.yaml.

Scramjet is experimental: site compatibility varies, and some authentication, media and browser features may fail. A successful iframe load is not a guarantee that the destination rendered correctly. The first navigation includes proxy initialization. This first version has no multi-user access control; configure suitable access controls and resource limits before opening it to a wide audience. Do not place credentials or private services on this app's origin. No destination-content cache or browsing logs are added by the application.

## Credits

Proxy components: [Mercury Workshop Scramjet](https://github.com/MercuryWorkshop/scramjet), BareMux, libcurl-transport and wisp-js, under their respective licenses. The integration follows the official Scramjet-App wiring; application UI code is original.
