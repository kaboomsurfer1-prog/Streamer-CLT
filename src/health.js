const { startDashboardServer } = require("./dashboard");

function startHealthServer(store, client) {
  return startDashboardServer(store, client);
}

module.exports = {
  startHealthServer
};