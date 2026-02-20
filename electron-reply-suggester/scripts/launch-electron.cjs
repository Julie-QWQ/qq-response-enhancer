const { spawn } = require("child_process");
const path = require("path");
const electronBinary = require("electron");

const devServerUrl = process.argv[2] ? String(process.argv[2]) : "";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (devServerUrl) {
  env.VITE_DEV_SERVER_URL = devServerUrl;
}

const child = spawn(electronBinary, ["."], {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
  env,
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

