const { promisify } = require("util");
const { spawn, exec: execCallback } = require("child_process");
const exec = promisify(execCallback);
const path = require("path");
const fs = require("fs");
const bundledBin = require("@expo/ngrok-bin");
// PATCH: resolve a modern agent binary. Accounts can enforce a minimum agent
// version (ERR_NGROK_121) that the bundled v2 cannot meet. Preference order:
// NGROK_BIN env var -> repo-shipped tools/ngrok/ngrok.exe -> bundled v2.
function resolveAgentBin() {
  const candidates = [];
  if (process.env.NGROK_BIN) candidates.push(process.env.NGROK_BIN);
  // node_modules/@expo/ngrok/src -> repo root (four levels up) -> tools/ngrok
  candidates.push(path.resolve(__dirname, "..", "..", "..", "..", "tools", "ngrok", "ngrok.exe"));
  candidates.push(bundledBin);
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return bundledBin;
}
const bin = resolveAgentBin();
const isModernAgent = bin !== bundledBin;

const ready = /starting web service.*addr=(\d+\.\d+\.\d+\.\d+:\d+)/;
const inUse = /address already in use/;

let processPromise, activeProcess;

/*
  ngrok process runs internal ngrok api
  and should be spawned only ONCE
  (respawn allowed if it fails or .kill method called)
*/
async function getProcess(opts) {
  if (processPromise) return processPromise;
  try {
    processPromise = startProcess(opts);
    return await processPromise;
  } catch (ex) {
    processPromise = null;
    throw ex;
  }
}

function getActiveProcess() {
  return activeProcess;
}

function parseAddr(message) {
  if (message[0] === "{") {
    const parsed = JSON.parse(message);
    return parsed.addr
  } else {
    const parsed = message.match(ready);
    if (parsed) {
      return parsed[1];
    }
  }
}

async function startProcess(opts) {
  const start = ["start", "--none", "--log=stdout"];
  if (opts.region) start.push("--region=" + opts.region);
  if (opts.configPath) start.push("--config=" + opts.configPath);

  const ngrok = spawn(bin, start, { windowsHide: true });

  let resolve, reject;
  const apiUrl = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  ngrok.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    if (opts.onLogEvent) {
      opts.onLogEvent(msg);
    }
    if (opts.onStatusChange) {
      if (msg.match("client session established")) {
        opts.onStatusChange("connected");
      } else if (msg.match("session closed, starting reconnect loop")) {
        opts.onStatusChange("closed");
      }
    }

    const msgs = msg.split(/\n/);
    msgs.forEach(msg => {
      const addr = parseAddr(msg);
      if (addr) {
        resolve(`http://${addr}`);
      } else if (msg.match(inUse)) {
        reject(new Error(msg.substring(0, 10000)));
      }
    })
  });

  ngrok.stderr.on("data", (data) => {
    const msg = data.toString().substring(0, 10000);
    reject(new Error(msg));
  });

  ngrok.on("exit", () => {
    processPromise = null;
    activeProcess = null;
  });

  ngrok.on("error", (err) => {
    reject(err);
  });

  try {
    const url = await apiUrl;
    activeProcess = ngrok;
    return url;
  } catch (ex) {
    ngrok.kill();
    throw ex;
  } finally {
    // Remove the stdout listeners if nobody is interested in the content.
    if (!opts.onLogEvent && !opts.onStatusChange) {
      ngrok.stdout.removeAllListeners("data");
    }
    ngrok.stderr.removeAllListeners("data");
  }
}

function killProcess() {
  if (!activeProcess) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    activeProcess.on("exit", () => resolve());
    activeProcess.kill();
  });
}

process.on("exit", () => {
  if (activeProcess) {
    activeProcess.kill();
  }
});

/**
 * @param {string | Ngrok.Options} optsOrToken
 */
async function setAuthtoken(optsOrToken) {
  const isOpts = typeof optsOrToken !== "string";
  const opts = isOpts ? optsOrToken : {};
  const token = isOpts ? opts.authtoken : optsOrToken;

  // PATCH: modern (v3) agents use `config add-authtoken`; the v2 CLI used bare `authtoken`.
  const authtoken = isModernAgent
    ? ["config", "add-authtoken", token]
    : ["authtoken", token];
  if (opts.configPath) authtoken.push("--config=" + opts.configPath);

  const ngrok = spawn(bin, authtoken, { windowsHide: true });

  const killed = new Promise((resolve, reject) => {
    ngrok.stdout.once("data", () => resolve());
    ngrok.stderr.once("data", () => reject(new Error("cant set authtoken")));
    ngrok.on("error", (err) => reject(err));
  });

  try {
    return await killed;
  } finally {
    ngrok.kill();
  }
}

/**
 * @param {Ngrok.Options | undefined} opts
 */
async function getVersion(opts = {}) {
  const { stdout } = await exec(`${bin} --version`);
  return stdout.replace("ngrok version", "").trim();
}

module.exports = {
  getProcess,
  getActiveProcess,
  killProcess,
  setAuthtoken,
  getVersion,
};
