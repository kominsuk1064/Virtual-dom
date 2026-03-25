const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4173;
const HOST = "127.0.0.1";
const ROOT = __dirname;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function resolveFilePath(requestUrl) {
  const pathname = decodeURIComponent((requestUrl || "/").split("?")[0]);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(ROOT, relativePath));

  if (!filePath.startsWith(ROOT)) {
    return null;
  }

  return filePath;
}

function sendFile(filePath, response) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.setHeader("Content-Type", MIME_TYPES[extension] || "application/octet-stream");
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const filePath = resolveFilePath(request.url);

  if (!filePath) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  sendFile(filePath, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Local server running at http://${HOST}:${PORT}`);
});
