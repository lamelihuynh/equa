import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = join(root, '.github/components.json');

export function readComponents() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.components) || manifest.components.length === 0)
    throw new Error('Component manifest must contain a nonempty components array.');
  const ids = new Set();
  const packages = new Set();
  for (const component of manifest.components) {
    if (!component.id || !component.path || !component.package || !component.kind)
      throw new Error('Every component needs id, path, package, and kind.');
    if (ids.has(component.id) || packages.has(component.package))
      throw new Error(`Duplicate component id or package: ${component.id}`);
    ids.add(component.id);
    packages.add(component.package);
    const pkgPath = join(root, component.path, 'package.json');
    if (
      !existsSync(pkgPath) ||
      JSON.parse(readFileSync(pkgPath, 'utf8')).name !== component.package
    )
      throw new Error(`Manifest package does not match ${pkgPath}`);
    if (
      component.deployable &&
      (!component.dockerfile || !component.image || !existsSync(join(root, component.dockerfile)))
    )
      throw new Error(`Deployable ${component.id} needs an existing Dockerfile and image.`);
    if (component.staging && (!component.deployable || !component.staging.hookSecret))
      throw new Error(
        `Staging component ${component.id} needs a deployable image and hook secret name.`,
      );
  }
  return manifest.components;
}

export function detectAffected(files, components = readComponents()) {
  const normalized = files.map((file) => file.replaceAll('\\', '/').replace(/^\.\//, ''));
  const componentByPackage = new Map(components.map((component) => [component.package, component]));
  const affected = new Set();
  const broadFiles = new Set([
    '.github/components.json',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
    '.env.example',
    'eslint.config.mjs',
    'tsconfig.base.json',
  ]);

  for (const file of normalized) {
    if (file.startsWith('docs/') || file.endsWith('.md')) continue;
    if (
      broadFiles.has(file) ||
      file.startsWith('.github/workflows/') ||
      file.startsWith('infra/compose/') ||
      file.startsWith('infra/kong/')
    ) {
      for (const component of components) affected.add(component.id);
      continue;
    }
    if (file.startsWith('infra/docker/')) {
      for (const component of components) {
        if (component.dockerfile?.startsWith('infra/docker/')) affected.add(component.id);
      }
      continue;
    }
    const owner = components.find(
      (component) => file === component.path || file.startsWith(`${component.path}/`),
    );
    if (owner) {
      affected.add(owner.id);
      continue;
    }
    // Unclassified source or build tooling is safer to validate broadly.
    if (file.startsWith('scripts/') || file.startsWith('packages/') || file.startsWith('infra/')) {
      for (const component of components) affected.add(component.id);
    }
  }

  // Workspace dependency changes propagate to direct and transitive consumers.
  let changed = true;
  while (changed) {
    changed = false;
    for (const component of components) {
      if (affected.has(component.id)) continue;
      const pkg = JSON.parse(readFileSync(join(root, component.path, 'package.json'), 'utf8'));
      const dependencies = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.optionalDependencies,
      };
      if (
        Object.keys(dependencies).some(
          (name) => componentByPackage.has(name) && affected.has(componentByPackage.get(name).id),
        )
      ) {
        affected.add(component.id);
        changed = true;
      }
    }
  }
  return components.filter((component) => affected.has(component.id));
}

export function matrixFor(components, mode = 'quality') {
  if (!['quality', 'images', 'staging'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  const selected = components.filter((component) =>
    mode === 'quality'
      ? true
      : mode === 'images'
        ? component.deployable
        : Boolean(component.staging),
  );
  return {
    include: selected.map((component) => ({
      id: component.id,
      path: component.path,
      package: component.package,
      kind: component.kind,
      ...(component.deployable ? { dockerfile: component.dockerfile, image: component.image } : {}),
      ...(component.staging
        ? {
            hookSecret: component.staging.hookSecret,
            smokeKind: component.staging.smoke?.kind ?? 'none',
            smokeUrlVar: component.staging.smoke?.urlVar ?? '',
            smokePath: component.staging.smoke?.path ?? '',
          }
        : {}),
    })),
  };
}

function parseArgs(args) {
  const options = { mode: 'quality' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--all') options.all = true;
    else if (['--base', '--head', '--mode'].includes(arg)) options[arg.slice(2)] = args[++index];
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  if (!options.all && (!options.base || !options.head))
    throw new Error('Provide --base and --head, or --all.');
  return options;
}

function changedFiles(base, head) {
  if (/^0+$/.test(base)) return null; // Initial branch push: validate all.
  try {
    const output = execFileSync('git', ['diff', '--name-only', '-z', `${base}...${head}`], {
      cwd: root,
    });
    return output.toString('utf8').split('\0').filter(Boolean);
  } catch {
    // A shallow or unavailable base must not silently skip a component.
    return null;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const components = readComponents();
    const files = options.all ? null : changedFiles(options.base, options.head);
    console.log(
      JSON.stringify(
        matrixFor(files === null ? components : detectAffected(files, components), options.mode),
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
