const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distLogger = path.join(projectRoot, 'dist', 'logger.js');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'loggerx-'));
}

function writeRunner(tmpDir, code) {
  const runnerPath = path.join(tmpDir, 'runner.mjs');
  fs.writeFileSync(runnerPath, code, 'utf8');
  return runnerPath;
}

function runChild(runnerPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath], {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

function readSingleLogFile(tmpDir) {
  const logsDir = path.join(tmpDir, 'logs');
  const files = fs.existsSync(logsDir) ? fs.readdirSync(logsDir) : [];
  if (files.length === 0) return { file: null, content: '' };
  // Pick the newest file
  const newest = files
    .map((f) => ({ f, t: fs.statSync(path.join(logsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f;
  const full = path.join(logsDir, newest);
  const content = fs.readFileSync(full, 'utf8');
  return { file: full, content };
}

function buildRunner(mode) {
  return `
    const modUrl = process.env.MODULE;
    const m = await import(modUrl);
    const { logger, captureProcess, captureFile } = m;

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    switch ('${mode}') {
      case 'info':
        logger.info('hello');
        break;
      case 'console':
        console.log('hello-from-console');
        break;
      case 'debug':
        logger.debug('secret');
        break;
      case 'truncate': {
        const big = 'a'.repeat(1100);
        logger.info(big);
        break;
      }
      case 'captureProc': {
        const { spawn } = await import('child_process');
        const c = spawn(process.execPath, ['-e', "console.log('OUT'); console.error('ERR')"], { stdio: ['ignore','pipe','pipe'] });
        captureProcess(c);
        await new Promise((res) => c.on('close', res));
        break;
      }
      case 'captureFile': {
        const fp = process.env.TARGET_FILE;
        captureFile(fp, 100);
        await wait(250);
        break;
      }
      default:
        break;
    }
    // small wait to flush stream
    await wait(150);
  `;
}

describe('loggerx end-to-end', () => {
  const moduleUrl = pathToFileURL(distLogger).href;

  test('writes info and stdout has colors when not JSON', async () => {
    const tmp = makeTmpDir();
    const runner = writeRunner(tmp, buildRunner('info'));
    const { out, code } = await runChild(runner, {
      cwd: tmp,
      env: { ...process.env, MODULE: moduleUrl, NODE_ENV: 'development', LOG_JSON: 'false' },
    });
    expect(code).toBe(0);
    // stdout should include ANSI color codes
    expect(/\x1b\[/.test(out)).toBe(true);
    const { content } = readSingleLogFile(tmp);
    expect(content).toMatch(/hello/);
    expect(content).toMatch(/INFO/);
  });

  test('console patch pipes to logger', async () => {
    const tmp = makeTmpDir();
    const runner = writeRunner(tmp, buildRunner('console'));
    await runChild(runner, {
      cwd: tmp,
      env: { ...process.env, MODULE: moduleUrl, NODE_ENV: 'development', LOG_JSON: 'false' },
    });
    const { content } = readSingleLogFile(tmp);
    expect(content).toMatch(/hello-from-console/);
    expect(content).toMatch(/INFO/);
  });

  test('debug is suppressed in production', async () => {
    const tmp = makeTmpDir();
    const runner = writeRunner(tmp, buildRunner('debug'));
    await runChild(runner, {
      cwd: tmp,
      env: { ...process.env, MODULE: moduleUrl, NODE_ENV: 'production', LOG_JSON: 'false' },
    });
    const { content } = readSingleLogFile(tmp);
    expect(content.trim()).toBe('');
  });

  test('JSON mode writes structured lines', async () => {
    const tmp = makeTmpDir();
    const runner = writeRunner(tmp, `
      const m = await import(process.env.MODULE);
      const { logger } = m;
      logger.info({ foo: 'bar' });
      await new Promise(r => setTimeout(r, 100));
    `);
    await runChild(runner, {
      cwd: tmp,
      env: { ...process.env, MODULE: moduleUrl, NODE_ENV: 'development', LOG_JSON: 'true' },
    });
    const { content } = readSingleLogFile(tmp);
    const line = content.trim();
    const obj = JSON.parse(line);
    expect(obj.level).toBe('info');
    expect(obj.message).toBe('{"foo":"bar"}');
  });

  test('long messages are truncated', async () => {
    const tmp = makeTmpDir();
    const runner = writeRunner(tmp, buildRunner('truncate'));
    await runChild(runner, {
      cwd: tmp,
      env: { ...process.env, MODULE: moduleUrl, NODE_ENV: 'development', LOG_JSON: 'false' },
    });
    const { content } = readSingleLogFile(tmp);
    expect(content).toMatch(/\[truncated\]/);
  });

  test('captureProcess collects stdout and stderr', async () => {
    const tmp = makeTmpDir();
    const runner = writeRunner(tmp, buildRunner('captureProc'));
    await runChild(runner, {
      cwd: tmp,
      env: { ...process.env, MODULE: moduleUrl, NODE_ENV: 'development', LOG_JSON: 'false' },
    });
    const { content } = readSingleLogFile(tmp);
    expect(content).toMatch(/OUT/);
    expect(content).toMatch(/ERR/);
  });

});
