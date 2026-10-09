import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filename);
    return /\.tsx?$/.test(filename) && !filename.endsWith('.test.ts') ? [filename] : [];
  });
}
const files = sourceFiles(sourceRoot);
function dependencies(filename: string): string[] {
  const source = ts.createSourceFile(
    filename,
    readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: string[] = [];
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports.map((specifier) => {
    const local = specifier.startsWith('@/')
      ? resolve(sourceRoot, specifier.slice(2))
      : specifier.startsWith('.')
        ? resolve(dirname(filename), specifier)
        : null;
    return local ? relative(sourceRoot, local).replaceAll('\\', '/') : specifier;
  });
}

it('keeps domain rules independent of frameworks and outer layers', () => {
  const violations = files
    .filter((file) => relative(sourceRoot, file).replaceAll('\\', '/').startsWith('server/domain/'))
    .flatMap((file) =>
      dependencies(file)
        .filter(
          (dependency) =>
            dependency !== 'server-only' &&
            dependency !== 'zod' &&
            dependency !== '@supernizo/shared' &&
            !dependency.startsWith('server/domain/'),
        )
        .map((dependency) => relative(sourceRoot, file) + ' -> ' + dependency),
    );
  expect(violations).toEqual([]);
});

it('keeps application and infrastructure independent of delivery code', () => {
  const violations = files
    .filter((file) =>
      /server\/(application|infrastructure)\//.test(
        relative(sourceRoot, file).replaceAll('\\', '/'),
      ),
    )
    .flatMap((file) =>
      dependencies(file)
        .filter(
          (dependency) =>
            /^(app|components|client|server\/(interfaces|composition))\//.test(dependency) ||
            /^(next|react)(\/|$)/.test(dependency) ||
            (relative(sourceRoot, file)
              .replaceAll('\\', '/')
              .startsWith('server/infrastructure/') &&
              dependency.startsWith('server/application/') &&
              !dependency.startsWith('server/application/ports/')),
        )
        .map((dependency) => relative(sourceRoot, file) + ' -> ' + dependency),
    );
  expect(violations).toEqual([]);
});

it('keeps reusable browser modules away from server code', () => {
  const violations = files
    .filter((file) =>
      /^(components|client|lib)\//.test(relative(sourceRoot, file).replaceAll('\\', '/')),
    )
    .flatMap((file) =>
      dependencies(file)
        .filter(
          (dependency) =>
            dependency.startsWith('server/') ||
            dependency.startsWith('@generated/') ||
            dependency.startsWith('@prisma/'),
        )
        .map((dependency) => relative(sourceRoot, file) + ' -> ' + dependency),
    );
  expect(violations).toEqual([]);
});

it('keeps application services and ports independent of concrete providers and composition', () => {
  const forbidden =
    /^(server\/(infrastructure|interfaces|composition)\/|@generated\/|@prisma\/|@upstash\/|livekit-server-sdk|next(?:\/|$)|react(?:\/|$))/;
  const violations = files
    .filter((file) =>
      relative(sourceRoot, file).replaceAll('\\', '/').startsWith('server/application/'),
    )
    .flatMap((file) =>
      dependencies(file)
        .filter((dependency) => forbidden.test(dependency))
        .map((dependency) => relative(sourceRoot, file) + ' -> ' + dependency),
    );
  expect(violations).toEqual([]);
});

it('keeps database implementation details out of routes, pages, and interfaces', () => {
  const violations = files
    .filter((file) =>
      /^(app|server\/interfaces)\//.test(relative(sourceRoot, file).replaceAll('\\', '/')),
    )
    .flatMap((file) =>
      dependencies(file)
        .filter((dependency) =>
          /^(server\/infrastructure\/(db|repositories)\/|@generated\/|@prisma\/)/.test(dependency),
        )
        .map((dependency) => relative(sourceRoot, file) + ' -> ' + dependency),
    );
  expect(violations).toEqual([]);
});
