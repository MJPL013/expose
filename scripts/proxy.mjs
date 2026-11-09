import http from "node:http";

/** One origin for HttpOnly cookies, realtime sockets, AudioWorklet and the installable app. */
export function createProxy() {
  const target = (req) => ({
    host: "127.0.0.1",
    port: req.url.startsWith("/api/") ? 4000 : 3001,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });
  const server = http.createServer((req, res) => {
    const upstream = http.request(target(req), (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent)
        res.writeHead(502, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
      res.end(
        JSON.stringify({
          error: {
            code: "SERVICE_STARTING",
            message: "The game service is starting. Try again shortly.",
          },
        }),
      );
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });
  server.on("upgrade", (req, socket, head) => {
    const upstream = http.request(target(req));
    upstream.on("upgrade", (response, remote, remoteHead) => {
      socket.write(
        `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${Object.entries(
          response.headers,
        )
          .map(([key, value]) => `${key}: ${value}`)
          .join("\r\n")}\r\n\r\n`,
      );
      if (head.length) remote.write(head);
      if (remoteHead.length) socket.write(remoteHead);
      remote.pipe(socket);
      socket.pipe(remote);
      remote.on("error", () => socket.destroy());
      socket.on("error", () => remote.destroy());
    });
    upstream.on("response", (response) => {
      socket.end(
        `HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`,
      );
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  return server;
}
