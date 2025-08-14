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

let stream = fs.createWriteStream(getLogFile(), { flags: "a" });
stream.on("error", (err) => process.stdout.write(`[LOGGER ERROR] ${err}\n`));

const colors: Record<LogLevel | "reset", string> = {
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[36m",
  reset: "\x1b[0m",
};

function getDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
}

function getLogFile(): string {
  const dateStr = getDateString();
  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith(`app-${process.pid}-${dateStr}`))
    .sort();
  const latest = files.pop() ?? `app-${process.pid}-${dateStr}-1.log`;
  const fullPath = path.join(logDir, latest);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > MAX_FILE_SIZE) {
    const lastPart = latest.split("-").pop();
    const numPart = lastPart?.split(".")[0];
    const num = (parseInt(numPart ?? "0", 10) || 0) + 1;
    return path.join(logDir, `app-${process.pid}-${dateStr}-${num}.log`);
  }
  return fullPath;
}

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
  const streamPath = stream.path?.toString();
  if (
    streamPath &&
    fs.existsSync(streamPath) &&
    fs.statSync(streamPath).size > MAX_FILE_SIZE
  ) {
    stream.end();
    stream = fs.createWriteStream(getLogFile(), { flags: "a" });
  }
  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith(`app-${process.pid}-${getDateString()}`))
    .sort();
  while (files.length > MAX_FILES) {
    fs.unlinkSync(path.join(logDir, files.shift()!));
  }
}

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
  stream.end(() => process.exit());
}
process.on("SIGINT", flushAndExit);
process.on("SIGTERM", flushAndExit);
process.on("exit", () => stream.end());

console.log = (...args: any[]) => logger.info(args);
console.warn = (...args: any[]) => logger.warn(args);
console.error = (...args: any[]) => logger.error(args);
console.debug = (...args: any[]) => logger.debug(args);

export function captureProcess(proc: ChildProcess) {
  proc.stdout?.on("data", (data) => logger.info(data.toString()));
  proc.stderr?.on("data", (data) => logger.error(data.toString()));
}

export function captureFile(filePath: string, interval = 5000) {
  if (!fs.existsSync(filePath)) return;
  setInterval(() => {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      if (data) logger.info(`Logs de archivo ${filePath}: ${data}`);
    } catch {}
  }, interval);
}
