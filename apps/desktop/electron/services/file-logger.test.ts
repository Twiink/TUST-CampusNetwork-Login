import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createLogger, exportLogHistory } from '@repo/shared';
const ports = vi.hoisted(() => ({ directory: '', createStream: vi.fn() }));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  createWriteStream: ports.createStream,
}));
vi.mock('electron', () => ({ app: { getPath: () => ports.directory } }));
import { FileLogger } from './file-logger';
const fsReal = await vi.importActual<typeof import('node:fs')>('node:fs');
const directories: string[] = [];
const sinks: FileLogger[] = [];
afterEach(async () => {
  await Promise.all(sinks.splice(0).map((sink) => sink.close()));
  vi.restoreAllMocks();
  directories.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});
function setup(options = {}) {
  ports.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'netmate-logs-'));
  directories.push(ports.directory);
  ports.createStream.mockReset();
  ports.createStream.mockImplementation(fsReal.createWriteStream);
  const logger = createLogger();
  logger.stopAutoCleanup();
  const attach = () => {
    const sink = new FileLogger(options).attach(logger);
    sinks.push(sink);
    return sink;
  };
  return { logger, attach };
}
it('reports an unopenable journal while retaining memory records', async () => {
  const { logger, attach } = setup();
  fs.mkdirSync(path.join(ports.directory, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(ports.directory, 'logs', 'netmate.jsonl'));
  const sink = attach();
  logger.info('readable memory record');
  await vi.waitFor(() =>
    expect(logger.getLogs().some((entry) => entry.message.includes('文件日志不可用'))).toBe(true)
  );
  expect(
    (await sink.query()).entries.some((entry) => entry.message === 'readable memory record')
  ).toBe(true);
});
it('stops a failed stream before reporting the asynchronous write error', async () => {
  const { logger, attach } = setup();
  const stream = Object.assign(new EventEmitter(), {
    write: vi.fn((_line, callback) => callback()),
    end: vi.fn((callback) => callback()),
    destroy: vi.fn(),
  });
  ports.createStream.mockReturnValue(stream as never);
  const sink = attach();
  logger.info('before failure');
  await sink.all();
  stream.emit('error', new Error('fixture write rejected'));
  logger.info('after failure');
  expect(stream.write).toHaveBeenCalledTimes(1);
  expect((await sink.query()).error).toContain('fixture write rejected');
});
it('late errors from a rolled stream cannot disable its replacement', async () => {
  const { logger, attach } = setup({ maxFileSize: 400 });
  const stream = () =>
    Object.assign(new EventEmitter(), {
      write: vi.fn((_line, callback) => callback()),
      end: vi.fn((callback) => callback()),
      destroy: vi.fn(),
    });
  const old = stream();
  const current = stream();
  ports.createStream.mockReturnValueOnce(old as never).mockReturnValue(current as never);
  const sink = attach();
  logger.info('x'.repeat(250));
  await sink.all();
  logger.info('current');
  await sink.all();
  old.emit('error', new Error('late failure'));
  expect(current.write).toHaveBeenCalled();
  expect((await sink.query()).error).toBeUndefined();
});
it('reports oversized records without exceeding the file limit or losing readable memory content', async () => {
  const { logger, attach } = setup({ maxFileSize: 500 });
  const sink = attach();
  const message = 'x'.repeat(1000);
  logger.info(message);
  const page = await sink.query();
  expect(page.error).toContain('单条日志超过文件大小上限');
  expect(page.entries.some((entry) => entry.message === message)).toBe(true);
  for (const file of fs.readdirSync(sink.getLogDir()))
    expect(fs.statSync(path.join(sink.getLogDir(), file)).size).toBeLessThanOrEqual(500);
});
it('queries and exports all history after restart, including records beyond the memory buffer', async () => {
  const { logger, attach } = setup();
  const first = attach();
  for (let index = 0; index < 710; index++)
    logger.log(index === 1 ? 'error' : 'info', `record ${index}`, {
      source: index === 1 ? 'portal' : 'app',
      data: { password: 'fixture-only', index },
    });
  await first.close();
  const restored = new FileLogger();
  sinks.push(restored);
  const page = await restored.query({ level: 'error', source: 'portal', keyword: 'record 1' });
  expect(page.total).toBe(1);
  expect(page.entries[0].data).toMatchObject({ password: '[REDACTED]' });
  const snapshot = await restored.all();
  expect(snapshot.entries).toHaveLength(710);
  const exported = JSON.parse(exportLogHistory(snapshot.entries, 'json'));
  expect(exported.meta.totalEntries).toBe(710);
  expect(exported.entries).toHaveLength(710);
  const next = await restored.query({ limit: 500 });
  expect(next.hasMore).toBe(true);
  expect((await restored.query({ cursor: next.nextCursor })).entries).toHaveLength(200);
});
it('rotates at the configured size, reads legacy text unchanged, and applies retention', async () => {
  const { logger, attach } = setup({ maxFileSize: 1000 });
  const sink = attach();
  for (let i = 0; i < 80; i++) logger.info(`record-${i}`);
  await sink.all();
  const directory = sink.getLogDir();
  const files = fs.readdirSync(directory);
  expect(files.filter((file) => file.endsWith('.jsonl'))).toHaveLength(4);
  files.forEach((file) =>
    expect(fs.statSync(path.join(directory, file)).size).toBeLessThanOrEqual(1000)
  );
  const line = `[${new Date().toISOString()}] [WARN   ] [wifi    ] [Legacy] original line\n`;
  const legacy = path.join(directory, 'netmate.log');
  fs.writeFileSync(legacy, line);
  const old = path.join(directory, 'netmate.1.log');
  fs.writeFileSync(old, `[2020-01-01T00:00:00Z] [INFO   ] [general ] expired\n`);
  const page = await sink.query({ source: 'Legacy' });
  expect(page.entries[0].data).toEqual({ originalText: line.trimEnd() });
  expect(fs.readFileSync(legacy, 'utf8')).toBe(line);
  expect((await sink.all()).entries.some((entry) => entry.message === 'expired')).toBe(false);
});
it('clear removes durable records and retains a write issued while clear is pending', async () => {
  const { logger, attach } = setup();
  const sink = attach();
  logger.info('before clear');
  await sink.all();
  logger.clearLogs();
  const clearing = sink.clear();
  logger.info('after clear');
  await clearing;
  expect((await sink.all()).entries.map((entry) => entry.message)).toEqual(['after clear']);
});

it('keeps readable records when one historical line is damaged and prunes expired structured rows', async () => {
  const { logger, attach } = setup();
  const sink = attach();
  logger.info('current');
  await sink.all();
  const old = {
    id: 'old',
    timestamp: '2020-01-01T00:00:00Z',
    level: 'info',
    message: 'expired-row',
  };
  fs.writeFileSync(
    path.join(sink.getLogDir(), 'netmate.1.jsonl'),
    JSON.stringify(old) +
      '\n' +
      JSON.stringify({ ...old, id: 'retained', timestamp: new Date(), message: 'retained-row' }) +
      '\n'
  );
  await sink.all();
  expect(fs.readFileSync(path.join(sink.getLogDir(), 'netmate.1.jsonl'), 'utf8')).not.toContain(
    'expired-row'
  );
  fs.appendFileSync(path.join(sink.getLogDir(), 'netmate.1.jsonl'), '{broken\n');
  const page = await sink.query();
  expect(page.entries.map((entry) => entry.message)).toEqual(
    expect.arrayContaining(['current', 'retained-row'])
  );
  expect(page.error).toContain('第 2 行');
});
