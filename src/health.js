const http = require("node:http");

function startHealthServer(store) {
  const port = process.env.PORT;
  if (!port) return null;

  const server = http.createServer((request, response) => {
    if (request.url !== "/health" && request.url !== "/") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }

    const data = store.snapshot();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        name: "Bot Streamers CLT",
        sources: data.sources.length,
        enabledSources: data.sources.filter((source) => source.enabled).length
      })
    );
  });

  server.listen(Number(port), "0.0.0.0");
  return server;
}

module.exports = {
  startHealthServer
};
