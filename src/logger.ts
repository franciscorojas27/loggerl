import fs from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";

type LogLevel = "info" | "warn" | "error" | "debug";
type LogMessage = string | object | number | boolean | null | undefined;

const logDir = path.resolve("./logs");
fs.mkdirSync(logDir, { recursive: true });

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;
const ENV = process.env.NODE_ENV || "development";
const ENABLE_DEBUG = ENV === "development";
const USE_JSON = process.env.LOG_JSON === "true";

let stream: fs.WriteStream;
let currentFile: string;

function getDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
}

function getTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}-${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}-${now.getSeconds().toString().padStart(2, "0")}`;
}

function createLogFile(): string {
  const dateStr = getDateString();
  const timeStr = getTimeString();
  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith(`app-${process.pid}-${dateStr}`))
    .sort();

  let latest = files.pop();
  if (!latest) {
    latest = `app-${process.pid}-${dateStr}-${timeStr}-1.log`;
  }

  const fullPath = path.join(logDir, latest);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size > MAX_FILE_SIZE) {
    const numPart = latest.split("-").pop()?.split(".")[0] || "0";
    const num = parseInt(numPart, 10) + 1;
    return path.join(
      logDir,
      `app-${process.pid}-${dateStr}-${timeStr}-${num}.log`
    );
  }

  return fullPath;
}

function initStream() {
  currentFile = createLogFile();
  stream = fs.createWriteStream(currentFile, { flags: "a" });
  stream.on("error", (err) => process.stdout.write(`[LOGGER ERROR] ${err}\n`));
}

initStream();

function safeStringify(obj: LogMessage, maxLength = 1000): string {
  try {
    let str = typeof obj === "string" ? obj : JSON.stringify(obj);
    if (str.length > maxLength)
      str = str.slice(0, maxLength) + "...[truncated]";
    return str;
  } catch {
    return "[Unserializable Object]";
  }
}

function rotateIfNeeded() {
  if (!stream || !fs.existsSync(currentFile)) {
    initStream();
    return;
  }
  if (fs.statSync(currentFile).size > MAX_FILE_SIZE) {
    stream.end();
    initStream();
  }

  const dateStr = getDateString();
  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith(`app-${process.pid}-${dateStr}`))
    .sort();
  while (files.length > MAX_FILES) {
    fs.unlinkSync(path.join(logDir, files.shift()!));
  }
}

const colors: Record<LogLevel | "reset", string> = {
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[36m",
  reset: "\x1b[0m",
};

function writeLog(level: LogLevel, message: LogMessage) {
  if (level === "debug" && !ENABLE_DEBUG) return;

  const timestamp = new Date().toISOString();
  const pid = process.pid;

  let line: string;
  if (USE_JSON) {
    line =
      JSON.stringify({
        timestamp,
        pid,
        level,
        message: safeStringify(message),
      }) + "\n";
  } else {
    const color = colors[level] || colors.reset;
    line = `[${timestamp}] [PID ${pid}] [${level.toUpperCase()}] ${safeStringify(
      message
    )}\n`;
    process.stdout.write(`${color}${line}${colors.reset}`);
  }

  rotateIfNeeded();

  if (!stream.write(line)) stream.once("drain", () => {});
}

export const logger = {
  info: (msg: LogMessage) => writeLog("info", msg),
  warn: (msg: LogMessage) => writeLog("warn", msg),
  error: (msg: LogMessage) => writeLog("error", msg),
  debug: (msg: LogMessage) => writeLog("debug", msg),
};

function flushAndExit() {
  if (stream) stream.end(() => process.exit());
}

process.on("SIGINT", flushAndExit);
process.on("SIGTERM", flushAndExit);
process.on("exit", () => stream.end());

// Patch global console
console.log = (...args: any[]) => logger.info(args);
console.warn = (...args: any[]) => logger.warn(args);
console.error = (...args: any[]) => logger.error(args);
console.debug = (...args: any[]) => logger.debug(args);

export function captureProcess(proc: ChildProcess) {
  const stdoutListener = (data: Buffer) => logger.info(data.toString());
  const stderrListener = (data: Buffer) => logger.error(data.toString());

  proc.stdout?.on("data", stdoutListener);
  proc.stderr?.on("data", stderrListener);

  // Return a cleanup function
  return () => {
    proc.stdout?.off("data", stdoutListener);
    proc.stderr?.off("data", stderrListener);
  };
}

export function captureFile(filePath: string, interval = 5000) {
  if (!fs.existsSync(filePath)) return;

  const timer = setInterval(() => {
    try {
      if (!fs.existsSync(filePath)) return;
      const data = fs.readFileSync(filePath, "utf-8");
      if (data) logger.info(`Logs de archivo ${filePath}: ${data}`);
    } catch {}
  }, interval);

  // Return cleanup
  return () => clearInterval(timer);
}
