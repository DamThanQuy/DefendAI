const { Project } = require('ts-morph');
const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

program
  .version('1.0.0')
  .description('AI Source Code Analyzer')
  .requiredOption('-t, --target <path>', 'Target file to analyze')
  .option('-o, --output <format>', 'Output format (json, text)', 'json')
  .option('--eslint', 'Run ESLint on the target file', false)
  .parse(process.argv);

const options = program.opts();
const targetPath = path.resolve(process.cwd(), options.target);

if (!fs.existsSync(targetPath)) {
  console.error(`Error: Target file not found at ${targetPath}`);
  process.exit(1);
}

function analyzeAST(filePath) {
  const project = new Project();
  project.addSourceFileAtPath(filePath);
  const sourceFile = project.getSourceFileOrThrow(filePath);

  const result = {
    file: filePath,
    imports: [],
    exports: [],
    classes: [],
    functions: [],
    interfaces: [],
    types: []
  };

  // Analyze Imports
  sourceFile.getImportDeclarations().forEach(imp => {
    result.imports.push({
      module: imp.getModuleSpecifierValue(),
      names: imp.getNamedImports().map(n => n.getName()),
      default: imp.getDefaultImport() ? imp.getDefaultImport().getText() : null
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
      methods: [],
      properties: []
    };

    cls.getMethods().forEach(method => {
      clsData.methods.push({
        name: method.getName(),
        parameters: method.getParameters().map(p => ({
          name: p.getName(),
          type: p.getTypeNode() ? p.getTypeNode().getText() : 'any'
        })),
        returnType: method.getReturnTypeNode() ? method.getReturnTypeNode().getText() : 'any'
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
        type: p.getTypeNode() ? p.getTypeNode().getText() : 'any'
      })),
      returnType: func.getReturnTypeNode() ? func.getReturnTypeNode().getText() : 'any'
    });
  });

  // Analyze Arrow Functions (often used for React components)
  sourceFile.getVariableDeclarations().forEach(vd => {
    const init = vd.getInitializer();
    if (init && (init.getKindName() === 'ArrowFunction' || init.getKindName() === 'FunctionExpression')) {
      const func = init;
      result.functions.push({
        name: vd.getName(),
        isExported: vd.getFirstAncestorByKind(238) !== undefined, // Check if it's within an ExportDeclaration
        isAsync: func.getModifiers().some(m => m.getText() === 'async'),
        parameters: func.getParameters().map(p => ({
          name: p.getName(),
          type: p.getTypeNode() ? p.getTypeNode().getText() : 'any'
        })),
        returnType: func.getReturnTypeNode() ? func.getReturnTypeNode().getText() : 'any'
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
        type: p.getTypeNode() ? p.getTypeNode().getText() : 'any'
      }))
    });
  });

  // Analyze Type Aliases
  sourceFile.getTypeAliases().forEach(typeAlias => {
    result.types.push({
      name: typeAlias.getName(),
      isExported: typeAlias.isExported(),
      type: typeAlias.getTypeNode() ? typeAlias.getTypeNode().getText() : 'any'
    });
  });

  return result;
}

function runESLint(filePath) {
  try {
    const eslintCmd = `npx eslint "${filePath}" --format json`;
    const output = execSync(eslintCmd, { encoding: 'utf-8', stdio: 'pipe' });
    return JSON.parse(output);
  } catch (error) {
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch(e) {
         return { error: 'Failed to parse ESLint output', raw: error.stdout };
      }
    }
    return { error: 'ESLint failed to run', message: error.message };
  }
}

async function main() {
  const result = {
    ast: null,
    eslint: null
  };

  try {
    result.ast = analyzeAST(targetPath);
  } catch (err) {
    result.ast = { error: 'Failed to parse AST', message: err.message };
  }

  if (options.eslint) {
    result.eslint = runESLint(targetPath);
  }

  if (options.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`--- AST Analysis for ${targetPath} ---`);
    console.log(`Classes: ${result.ast.classes?.length || 0}`);
    console.log(`Functions: ${result.ast.functions?.length || 0}`);
    console.log(`Imports: ${result.ast.imports?.length || 0}`);
    if (options.eslint) {
      console.log(`--- ESLint Results ---`);
      if (result.eslint && result.eslint.length > 0) {
        console.log(`Found ${result.eslint[0].errorCount} errors and ${result.eslint[0].warningCount} warnings.`);
      }
    }
  }
}

main();
