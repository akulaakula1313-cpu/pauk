/* ==========================================================================
   SANI GROUP — Пасьянс «Паук». Локальный сервер (server.js)
   Никаких внешних зависимостей — только встроенные модули Node.js.
   Запуск:  node server.js
   Затем откройте в браузере:  http://localhost:3000
   ========================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const safePath = path.normalize(path.join(ROOT, urlPath));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Доступ запрещён");
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 — файл не найден: " + urlPath);
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("========================================================");
  console.log("  ПАУК — пасьянс, разработано SANI GROUP");
  console.log(`  Сервер запущен: http://localhost:${PORT}`);
  console.log("  Откройте эту ссылку в браузере на компьютере или телефоне");
  console.log("========================================================");
});
