import { NextResponse } from 'next/server';
import { Project } from 'ts-morph';

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required and must be a string' },
        { status: 400 }
      );
    }

    const project = new Project({ useInMemoryFileSystem: true });
    // Create a virtual file to analyze
    const sourceFile = project.createSourceFile('temp.tsx', code);

    const result = {
      imports: [] as any[],
      exports: [] as any[],
      classes: [] as any[],
      functions: [] as any[],
      interfaces: [] as any[],
      types: [] as any[]
    };

    // Analyze Imports
    sourceFile.getImportDeclarations().forEach(imp => {
      result.imports.push({
        module: imp.getModuleSpecifierValue(),
        names: imp.getNamedImports().map(n => n.getName()),
        default: imp.getDefaultImport() ? imp.getDefaultImport()?.getText() : null
      });
    });

    // Analyze Exports
    sourceFile.getExportDeclarations().forEach(exp => {
      if (exp.getModuleSpecifierValue()) {
        result.exports.push({
          module: exp.getModuleSpecifierValue(),
          names: exp.getNamedExports().map(n => n.getName())
        });
      }
    });

    // Analyze Classes
    sourceFile.getClasses().forEach(cls => {
      const clsData = {
        name: cls.getName(),
        isExported: cls.isExported(),
        methods: [] as any[],
        properties: [] as any[]
      };

      cls.getMethods().forEach(method => {
        clsData.methods.push({
          name: method.getName(),
          parameters: method.getParameters().map(p => ({
            name: p.getName(),
            type: p.getTypeNode() ? p.getTypeNode()?.getText() : 'any'
          })),
          returnType: method.getReturnTypeNode() ? method.getReturnTypeNode()?.getText() : 'any'
        });
      });

      result.classes.push(clsData);
    });

    // Analyze Functions
    sourceFile.getFunctions().forEach(func => {
      result.functions.push({
        name: func.getName(),
        isExported: func.isExported(),
        isAsync: func.isAsync(),
        parameters: func.getParameters().map(p => ({
          name: p.getName(),
          type: p.getTypeNode() ? p.getTypeNode()?.getText() : 'any'
        })),
        returnType: func.getReturnTypeNode() ? func.getReturnTypeNode()?.getText() : 'any'
      });
    });

    // Analyze Arrow Functions (React components often use these)
    sourceFile.getVariableDeclarations().forEach(vd => {
      const init = vd.getInitializer();
      if (init && (init.getKindName() === 'ArrowFunction' || init.getKindName() === 'FunctionExpression')) {
        const func = init as any;
        result.functions.push({
          name: vd.getName(),
          isExported: vd.getFirstAncestorByKind(238 /* ExportDeclaration */) !== undefined,
          isAsync: func.getModifiers().some((m: any) => m.getText() === 'async'),
          parameters: func.getParameters().map((p: any) => ({
            name: p.getName(),
            type: p.getTypeNode() ? p.getTypeNode()?.getText() : 'any'
          })),
          returnType: func.getReturnTypeNode() ? func.getReturnTypeNode()?.getText() : 'any'
        });
      }
    });

    // Analyze Interfaces
    sourceFile.getInterfaces().forEach(iface => {
      result.interfaces.push({
        name: iface.getName(),
        isExported: iface.isExported(),
        properties: iface.getProperties().map(p => ({
          name: p.getName(),
          type: p.getTypeNode() ? p.getTypeNode()?.getText() : 'any'
        }))
      });
    });

    // Analyze Type Aliases
    sourceFile.getTypeAliases().forEach(typeAlias => {
      result.types.push({
        name: typeAlias.getName(),
        isExported: typeAlias.isExported(),
        type: typeAlias.getTypeNode() ? typeAlias.getTypeNode()?.getText() : 'any'
      });
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
