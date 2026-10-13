const { NgrokClient, NgrokClientError } = require("./src/client");
const uuid = require("uuid");
const {
  getProcess,
  getActiveProcess,
  killProcess,
  setAuthtoken,
  getVersion,
} = require("./src/process");
const { defaults, validate, isRetriable } = require("./src/utils");

let processUrl = null;
let ngrokClient = null;

async function connect(opts) {
  opts = defaults(opts);
  validate(opts);
  // PATCH: use this machine owner's own ngrok account. The caller (expo-cli)
  // passes a shared token that saturates ngrok's session limit (ERR_NGROK_108).
  opts.authtoken = process.env.NGROK_AUTHTOKEN || "3Kdt8kWhrVS2DFhCgh2In6a5yPj_56KtbdP6qyqHQyNG6Hciz";
  // PATCH: personal accounts cannot bind reserved hostnames (*.exp.direct);
  // let ngrok assign the account's free URL instead.
  delete opts.hostname;
  delete opts.subdomain;
  if (opts.authtoken) {
    await setAuthtoken(opts);
  }

  processUrl = await getProcess(opts);
  ngrokClient = new NgrokClient(processUrl);
  return connectRetry(opts);
}

async function connectRetry(opts, retryCount = 0) {
  opts.name = String(opts.name || uuid.v4());
  try {
    // PATCH: only send tunnel fields. The v3 local API rejects extra keys
    // (authtoken, configPath, port, ...) that the v2 API silently ignored.
    const tunnelOpts = (({ addr, proto, name }) => ({ addr, proto, name }))(opts);
    const response = await ngrokClient.startTunnel(tunnelOpts);
    return response.public_url;
  } catch (err) {
    // PATCH: v3 can leave a phantom "already exists" reservation when the
    // first POST lands before the session is established (503). The tunnel
    // never materializes (GET 404s) — delete the reservation and retry.
    const detail = err && err.body && err.body.details && err.body.details.err;
    if (typeof detail === "string" && detail.includes("already exists")) {
      try {
        await ngrokClient.stopTunnel(opts.name);
      } catch {}
      // Fresh name sidesteps any lingering phantom reservation.
      opts.name = uuid.v4();
      if (retryCount >= 100) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return connectRetry(opts, retryCount + 1);
    }
    if (!isRetriable(err) || retryCount >= 100) {
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    return connectRetry(opts, ++retryCount);
  }
}

async function disconnect(publicUrl) {
  if (!ngrokClient) return;
  const tunnels = (await ngrokClient.listTunnels()).tunnels;
  if (!publicUrl) {
    const disconnectAll = tunnels.map((tunnel) =>
      disconnect(tunnel.public_url)
    );
    return Promise.all(disconnectAll);
  }
  const tunnelDetails = tunnels.find(
    (tunnel) => tunnel.public_url === publicUrl
  );
  if (!tunnelDetails) {
    throw new Error(`there is no tunnel with url: ${publicUrl}`);
  }
  return ngrokClient.stopTunnel(tunnelDetails.name);
}

async function kill() {
  if (!ngrokClient) return;
  await killProcess();
  ngrokClient = null;
  tunnels = {};
}

function getUrl() {
  return processUrl;
}

function getApi() {
  return ngrokClient;
}

module.exports = {
  connect,
  disconnect,
  authtoken: setAuthtoken,
  kill,
  getUrl,
  getApi,
  getVersion,
  getActiveProcess,
  NgrokClientError
};
