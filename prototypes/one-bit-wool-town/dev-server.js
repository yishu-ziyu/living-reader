/* Minimal static dev server: forwards --port / PORT, no dependencies. */
const http = require("http");
const fs = require("fs");
const path = require("path");

let port = Number(process.env.PORT) || 7100;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if ((a === "--port" || a === "-p" || a === "--listen") && args[i + 1]) {
    port = Number(args[i + 1]);
  } else if (a.startsWith("--port=")) {
    port = Number(a.slice("--port=".length));
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const file = path.join(__dirname, rel);
    if (!file.startsWith(__dirname)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`wool-town prototype: http://127.0.0.1:${port}/`);
  });
