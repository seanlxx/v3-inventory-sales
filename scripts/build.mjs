import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptsDir);
const dist = join(root, 'dist');

function minifyCssContent(content) {
  return String(content)
    .replace(/\/\*[^!*][\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function stripJsComments(content) {
  const source = String(content);
  let result = '';
  let state = 'normal';
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] || '';

    if (state === 'lineComment') {
      if (char === '\n' || char === '\r') {
        result += char;
        state = 'normal';
      }
      continue;
    }

    if (state === 'blockComment') {
      if (char === '*' && next === '/') {
        index += 1;
        state = 'normal';
      }
      continue;
    }

    if (state === 'singleQuote' || state === 'doubleQuote' || state === 'template') {
      result += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (
        (state === 'singleQuote' && char === "'")
        || (state === 'doubleQuote' && char === '"')
        || (state === 'template' && char === '`')
      ) {
        state = 'normal';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'lineComment';
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      state = 'blockComment';
      index += 1;
      continue;
    }

    if (char === "'") state = 'singleQuote';
    else if (char === '"') state = 'doubleQuote';
    else if (char === '`') state = 'template';

    result += char;
  }

  return result;
}

function normalizeJsWhitespace(content) {
  const source = stripJsComments(content);
  const lines = [];
  let result = '';
  let state = 'normal';
  let escaped = false;
  let pendingSpace = false;

  const flushLine = () => {
    const line = result.trim();
    if (line) lines.push(line);
    result = '';
    pendingSpace = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (state === 'singleQuote' || state === 'doubleQuote' || state === 'template') {
      result += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (
        (state === 'singleQuote' && char === "'")
        || (state === 'doubleQuote' && char === '"')
        || (state === 'template' && char === '`')
      ) {
        state = 'normal';
      }
      continue;
    }

    if (char === '\r') continue;
    if (char === '\n') {
      flushLine();
      continue;
    }

    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }

    if (pendingSpace && result && !/^[\]\}),;:]$/.test(char) && !/[\[\({,;:]$/.test(result[result.length - 1])) {
      result += ' ';
    }
    pendingSpace = false;

    if (char === "'") state = 'singleQuote';
    else if (char === '"') state = 'doubleQuote';
    else if (char === '`') state = 'template';

    result += char;
  }

  flushLine();
  return `${lines.join('\n')}\n`;
}

function minifyJsContent(content) {
  return normalizeJsWhitespace(content).trim();
}

function copyTransformedDirectory(source, destination, transforms) {
  mkdirSync(destination, { recursive: true });

  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(destination, entry.name);

    if (entry.isDirectory()) {
      copyTransformedDirectory(sourcePath, targetPath, transforms);
      continue;
    }

    const extension = extname(entry.name).toLowerCase();
    const transform = transforms[extension];
    if (!transform) {
      copyFileSync(sourcePath, targetPath);
      continue;
    }

    const beforeBytes = statSync(sourcePath).size;
    const output = transform(readFileSync(sourcePath, 'utf8'));
    writeFileSync(targetPath, output, 'utf8');
    const afterBytes = statSync(targetPath).size;
    const rel = relative(root, sourcePath);
    console.log(`${rel}: ${beforeBytes} -> ${afterBytes} bytes`);
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

copyFileSync(join(root, 'index.html'), join(dist, 'index.html'));
copyTransformedDirectory(join(root, 'css'), join(dist, 'css'), { '.css': minifyCssContent });
copyTransformedDirectory(join(root, 'js'), join(dist, 'js'), { '.js': minifyJsContent });
copyFileSync(join(root, 'public_headers'), join(dist, '_headers'));
