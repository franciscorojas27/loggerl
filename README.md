# loggerl

Advanced Node.js logger with:

- Daily file logging with per-process file names
- Size-based rotation window (5MB per file, keep last 5 files)
- Optional JSON output via `LOG_JSON=true`
- Colorized console output (info/warn/error/debug)
- Safe stringify with truncation
- Global `console.*` patching
- Helpers to capture external child process output and tail third-party log files

## Install

```sh
npm install loggerl
```

If you're working from source, install dev deps and build:

```sh
npm install
npm run build
```

## Usage

```ts
import { logger, captureProcess, captureFile } from 'loggerl';

logger.info('Server started');
logger.warn({ slow: true, ms: 350 });
logger.error(new Error('boom'));
logger.debug('only in development');

// Forward a child process output into the logger
import { spawn } from 'child_process';
const child = spawn('node', ['-v']);
captureProcess(child);

// Periodically ingest a third-party log file
captureFile('/var/log/other-app.log', 2000);
```

## Behavior

- Files are created under `./logs` relative to your current working directory.
- Names: `app-<pid>-YYYY-MM-DD-<n>.log`.
- Rotation: when the active file exceeds 5MB, a new file is created; only the most recent 5 are kept for that day.
- Colorized console output is shown only when not in JSON mode.
- JSON mode: set `LOG_JSON=true` to write one JSON object per line to the file. Console color output is disabled in this mode.
- Debug level is enabled when `NODE_ENV=development`.

## API

- `logger.info|warn|error|debug(message: string | object | number | boolean | null | undefined)`
  - Writes to the active log file; also writes colorized line to stdout when not in JSON mode.
- `captureProcess(proc: ChildProcess)`
  - Pipes `proc.stdout` as info and `proc.stderr` as error into the logger.
- `captureFile(filePath: string, intervalMs = 5000)`
  - Every `intervalMs`, reads the entire file; if it has content, logs: `"Logs de archivo <path>: <content>"`.

## Configuration

- `LOG_JSON=true` — enable JSON line output (disables colorized console output).
- `NODE_ENV=development` — enables `debug` level.

## Notes

- The module patches global `console.*` to write through the logger. If you need to avoid this behavior in certain scripts, import dynamically where needed.
- The log directory is created if missing.

## Development

- Build: `npm run build`
- Test: `npm test`

```sh
# Runs TypeScript build, then executes Jest e2e tests
npm test
```
