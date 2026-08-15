import { NextResponse } from 'next/server';
import * as ts from 'typescript';

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required and must be a string' },
        { status: 400 }
      );
    }

    const sourceFile = ts.createSourceFile(
      'temp.tsx',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const result = {
      imports: [] as any[],
      exports: [] as any[],
      classes: [] as any[],
      functions: [] as any[],
      interfaces: [] as any[],
      types: [] as any[],
    };

    function getTypeText(typeNode: ts.TypeNode | undefined): string {
      return typeNode ? typeNode.getText(sourceFile) : 'any';
    }

    function isExported(node: ts.Node): boolean {
      if (!ts.canHaveModifiers(node)) return false;
      return (
        (ts.getModifiers(node)?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword
        ) as boolean) ?? false
      );
    }

    // Analyze imports
    sourceFile.forEachChild((node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpec = node.moduleSpecifier as ts.StringLiteral;
        const namedImports = node.importClause?.namedBindings;
        const names: string[] = [];
        let defaultImport: string | null = null;
        if (node.importClause?.name) {
          defaultImport = node.importClause.name.text;
        }
        if (namedImports && ts.isNamedImports(namedImports)) {
          namedImports.elements.forEach((e) => names.push(e.name.text));
        }
        result.imports.push({
          module: moduleSpec.text,
          names,
          default: defaultImport,
        });
      }
    });

    // Analyze exports (export declarations / export from)
    sourceFile.forEachChild((node) => {
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const moduleSpec = node.moduleSpecifier as ts.StringLiteral;
        const names: string[] = [];
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          node.exportClause.elements.forEach((e) => names.push(e.name.text));
        }
        result.exports.push({ module: moduleSpec.text, names });
      }
    });

    // Analyze classes, functions, interfaces, type aliases
    sourceFile.forEachChild((node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const clsData = {
          name: node.name.text,
          isExported: isExported(node),
          methods: [] as any[],
          properties: [] as any[],
        };
        node.members.forEach((member) => {
          if (ts.isMethodDeclaration(member)) {
            clsData.methods.push({
              name: member.name.getText(sourceFile),
              parameters: member.parameters.map((p) => ({
                name: p.name.getText(sourceFile),
                type: getTypeText(p.type),
              })),
              returnType: getTypeText(member.type),
            });
          } else if (ts.isPropertyDeclaration(member)) {
            clsData.properties.push({
              name: member.name.getText(sourceFile),
              type: getTypeText(member.type),
            });
          }
        });
        result.classes.push(clsData);
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        result.functions.push({
          name: node.name.text,
          isExported: isExported(node),
          isAsync:
            (ts.getModifiers(node)?.some(
              (m) => m.kind === ts.SyntaxKind.AsyncKeyword
            ) as boolean) ?? false,
          parameters: node.parameters.map((p) => ({
            name: p.name.getText(sourceFile),
            type: getTypeText(p.type),
          })),
          returnType: getTypeText(node.type),
        });
      } else if (ts.isInterfaceDeclaration(node)) {
        result.interfaces.push({
          name: node.name.text,
          isExported: isExported(node),
          properties: node.members.map((m) => ({
            name: (m as ts.PropertySignature).name?.getText(sourceFile) ?? '',
            type: getTypeText((m as ts.PropertySignature).type),
          })),
        });
      } else if (ts.isTypeAliasDeclaration(node)) {
        result.types.push({
          name: node.name.text,
          isExported: isExported(node),
          type: getTypeText(node.type),
        });
      }
    });

    // Analyze arrow / function expression variable declarations (React components)
    sourceFile.forEachChild((node) => {
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((decl) => {
          if (!ts.isIdentifier(decl.name)) return;
          const init = decl.initializer;
          if (
            init &&
            (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
          ) {
            result.functions.push({
              name: decl.name.text,
              isExported: isExported(node),
              isAsync:
                (ts.getModifiers(init)?.some(
                  (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                ) as boolean) ?? false,
              parameters: init.parameters.map((p) => ({
                name: p.name.getText(sourceFile),
                type: getTypeText(p.type),
              })),
              returnType: getTypeText(init.type),
            });
          }
        });
      }
    });

    return NextResponse.json({ success: true, ast: result });
  } catch (error: any) {
    console.error('Code analysis failed:', error);
    return NextResponse.json(
      { error: 'Failed to analyze code', message: error.message },
      { status: 500 }
    );
  }
}
