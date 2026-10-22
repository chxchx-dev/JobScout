import { readdir, readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const errors = [];
const warnings = [];

// Lista blanca: cualquier permiso fuera de aquí exige justificación explícita.
const ALLOWED_PERMISSIONS = new Set(['storage', 'activeTab']);
const ALLOWED_OPTIONAL_PERMISSIONS = new Set(['scripting']);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

// core debe ser puro: sin chrome, sin DOM, sin red, sin almacenamiento.
const CORE_FORBIDDEN = [
  [/\bchrome\s*\./, 'API de chrome'],
  [/\bdocument\s*\./, 'DOM'],
  [/\bwindow\s*\./, 'global de ventana'],
  [/\bfetch\s*\(/, 'red'],
  [/\bindexedDB\b/, 'almacenamiento'],
  [/\blocalStorage\b/, 'almacenamiento'],
];

// Render de datos externos: nunca innerHTML ni eval.
const GLOBAL_FORBIDDEN = [
  [/\binnerHTML\b/, 'innerHTML (usar textContent)'],
  [/\beval\s*\(/, 'eval'],
];

function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const item of entries) {
    if (SKIP_DIRS.has(item.name)) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) await collectFiles(path, out);
    else if (item.name.endsWith('.js') || item.name.endsWith('.mjs')) out.push(path);
  }
  return out;
}

function checkSyntax(files) {
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      errors.push(`Sintaxis inválida en ${relative(root, file)}\n${error.stderr?.toString() ?? ''}`);
    }
  }
}

function scanForbidden(files, rules, scope) {
  for (const file of files) {
    const relativePath = relative(root, file);
    const code = stripComments(globalThis.__cache.get(file));
    for (const [pattern, label] of rules) {
      if (pattern.test(code)) errors.push(`${relativePath}: uso de ${label} fuera de ${scope}`);
    }
  }
}

function assertPatternList(value, name) {
  if (!Array.isArray(value)) {
    errors.push(`manifest.${name} debe ser un array.`);
    return [];
  }
  for (const pattern of value) {
    if (pattern.includes('<all_urls>')) errors.push(`manifest.${name} usa <all_urls>: ${pattern}`);
    if (!pattern.startsWith('https://')) warnings.push(`manifest.${name} no es HTTPS: ${pattern}`);
  }
  return value;
}

// --- Manifest -----------------------------------------------------------

const manifestRaw = await readFile(join(root, 'manifest.json'), 'utf8');
let manifest;
try {
  manifest = JSON.parse(manifestRaw);
} catch (error) {
  errors.push(`manifest.json no es JSON válido: ${error.message}`);
}

if (manifest) {
  if (manifest.manifest_version !== 3) errors.push('manifest.json no es MV3.');

  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? '')) {
    errors.push(`manifest.version inválida: ${manifest.version}`);
  }

  if (!manifest.description || manifest.description.length > 132) {
    errors.push('manifest.description ausente o mayor de 132 caracteres.');
  }

  for (const permission of manifest.permissions ?? []) {
    if (!ALLOWED_PERMISSIONS.has(permission)) {
      errors.push(`Permiso no declarado en la lista blanca: ${permission}`);
    }
  }
  for (const permission of manifest.optional_permissions ?? []) {
    if (!ALLOWED_OPTIONAL_PERMISSIONS.has(permission)) {
      errors.push(`Permiso opcional no declarado en la lista blanca: ${permission}`);
    }
  }

  assertPatternList(manifest.host_permissions, 'host_permissions');
  const optionalHosts = assertPatternList(manifest.optional_host_permissions ?? [], 'optional_host_permissions');
  for (const pattern of optionalHosts) {
    if (pattern !== 'https://jobs.ashbyhq.com/*') {
      errors.push(`Permiso de host opcional fuera de la ficha N2 de Ashby: ${pattern}`);
    }
  }

  const worker = manifest.background?.service_worker;
  if (!worker) errors.push('Falta background.service_worker.');
  else if (!(await exists(join(root, worker)))) errors.push(`No existe el service worker: ${worker}`);

  const popup = manifest.action?.default_popup;
  if (!popup) warnings.push('Falta action.default_popup.');
  else if (!(await exists(join(root, popup)))) errors.push(`No existe el popup: ${popup}`);

  const scripts = manifest.content_scripts ?? [];
  if (!Array.isArray(scripts)) {
    errors.push('manifest.content_scripts debe ser un array.');
  } else {
    for (const entry of scripts) {
      const matches = assertPatternList(entry.matches, 'content_scripts.matches');
      if (matches.length === 0) errors.push('content_scripts sin matches.');
      for (const js of entry.js ?? []) {
        if (!(await exists(join(root, js)))) errors.push(`No existe el content script: ${js}`);
      }
      for (const css of entry.css ?? []) {
        warnings.push(`content_scripts inyecta CSS (${css}); revisar que no altere la página.`);
      }
    }
  }

  const packageRaw = await readFile(join(root, 'package.json'), 'utf8').catch(() => null);
  if (packageRaw) {
    const pkg = JSON.parse(packageRaw);
    if (pkg.version && pkg.version !== manifest.version) {
      errors.push(`Versión desalineada: manifest ${manifest.version} vs package ${pkg.version}`);
    }
  }
}

// --- Código -------------------------------------------------------------

const srcFiles = await collectFiles(join(root, 'src'));
const testFiles = await collectFiles(join(root, 'tests'));
const allFiles = [...srcFiles, ...testFiles];

globalThis.__cache = new Map();
for (const file of allFiles) {
  globalThis.__cache.set(file, await readFile(file, 'utf8'));
}

checkSyntax(allFiles);

const coreFiles = srcFiles.filter((file) => relative(root, file).replaceAll('\\', '/').startsWith('src/core/'));
scanForbidden(coreFiles, CORE_FORBIDDEN, 'src/core');

const renderFiles = srcFiles.filter((file) => /\.(js|mjs)$/.test(file));
scanForbidden(renderFiles, GLOBAL_FORBIDDEN, 'render seguro');

// --- Informe ------------------------------------------------------------

for (const warning of warnings) console.warn('AVISO', warning);
for (const error of errors) console.error('ERROR', error);

if (errors.length > 0) {
  console.error(`\n${errors.length} error(es), ${warnings.length} aviso(s).`);
  throw new Error('Comprobaciones fallidas.');
}

console.log(
  `OK manifest, ${allFiles.length} scripts y ${coreFiles.length} archivos de core puro. ` +
  `${warnings.length} aviso(s).`
);
