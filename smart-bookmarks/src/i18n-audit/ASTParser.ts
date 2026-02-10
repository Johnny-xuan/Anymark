/**
 * ASTParser - TypeScript/TSX AST parsing
 * 
 * Uses TypeScript Compiler API to parse TSX files and extract
 * imports, JSX elements, and string literals.
 */

import * as ts from 'typescript';
import type {
  ParsedFile,
  ImportInfo,
  JSXElementInfo,
  AttributeInfo,
  StringLiteralInfo,
  StringContext
} from './types';

/**
 * ASTParser class for parsing TypeScript/TSX files
 */
export class ASTParser {
  /**
   * Parse a TSX file and extract relevant information
   * Note: In browser environment, use parseContent directly with file content
   */
  async parse(filePath: string, content?: string): Promise<ParsedFile> {
    try {
      if (content === undefined) {
        // In Node.js environment, we would read the file
        // For browser compatibility, content must be provided
        throw new Error('Content must be provided for parsing');
      }
      return this.parseContent(filePath, content);
    } catch (error) {
      return {
        filePath,
        imports: [],
        jsxElements: [],
        stringLiterals: [],
        hasErrors: true,
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Parse TSX content string
   */
  parseContent(filePath: string, content: string): ParsedFile {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const imports: ImportInfo[] = [];
    const jsxElements: JSXElementInfo[] = [];
    const stringLiterals: StringLiteralInfo[] = [];

    // Visit all nodes
    const visit = (node: ts.Node) => {
      // Extract imports
      if (ts.isImportDeclaration(node)) {
        const importInfo = this.extractImport(node, sourceFile);
        if (importInfo) {
          imports.push(importInfo);
        }
      }

      // Extract JSX elements
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const jsxInfo = this.extractJSXElement(node, sourceFile);
        if (jsxInfo) {
          jsxElements.push(jsxInfo);
        }
      }

      // Extract string literals
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const stringInfo = this.extractStringLiteral(node, sourceFile);
        if (stringInfo) {
          stringLiterals.push(stringInfo);
        }
      }

      // Extract template literals
      if (ts.isTemplateExpression(node)) {
        const templateInfo = this.extractTemplateLiteral(node, sourceFile);
        if (templateInfo) {
          stringLiterals.push(templateInfo);
        }
      }

      // Extract JSX text
      if (ts.isJsxText(node)) {
        const text = node.text.trim();
        if (text) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          stringLiterals.push({
            value: text,
            line: line + 1,
            column: character + 1,
            context: 'jsx-text'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return {
      filePath,
      imports,
      jsxElements,
      stringLiterals,
      hasErrors: false
    };
  }

  /**
   * Extract import information from an import declaration
   */
  private extractImport(node: ts.ImportDeclaration, sourceFile: ts.SourceFile): ImportInfo | null {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      return null;
    }

    const moduleName = moduleSpecifier.text;
    const importedNames: string[] = [];

    const importClause = node.importClause;
    if (importClause) {
      // Default import
      if (importClause.name) {
        importedNames.push(importClause.name.text);
      }

      // Named imports
      const namedBindings = importClause.namedBindings;
      if (namedBindings) {
        if (ts.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            importedNames.push(element.name.text);
          }
        } else if (ts.isNamespaceImport(namedBindings)) {
          importedNames.push(`* as ${namedBindings.name.text}`);
        }
      }
    }

    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

    return {
      moduleName,
      importedNames,
      line: line + 1
    };
  }

  /**
   * Extract JSX element information
   */
  private extractJSXElement(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    sourceFile: ts.SourceFile
  ): JSXElementInfo {
    let tagName: string;
    let attributes: AttributeInfo[] = [];
    let textContent: string | null = null;

    if (ts.isJsxElement(node)) {
      // Full JSX element
      const openingElement = node.openingElement;
      tagName = this.getTagName(openingElement.tagName);
      attributes = this.extractAttributes(openingElement.attributes, sourceFile);
      textContent = this.extractTextContent(node.children);
    } else {
      // Self-closing element
      tagName = this.getTagName(node.tagName);
      attributes = this.extractAttributes(node.attributes, sourceFile);
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

    return {
      tagName,
      attributes,
      textContent,
      line: line + 1,
      column: character + 1
    };
  }

  /**
   * Get tag name from JSX tag name node
   */
  private getTagName(tagName: ts.JsxTagNameExpression): string {
    if (ts.isIdentifier(tagName)) {
      return tagName.text;
    }
    if (ts.isPropertyAccessExpression(tagName)) {
      return tagName.getText();
    }
    return tagName.getText();
  }

  /**
   * Extract attributes from JSX attributes
   */
  private extractAttributes(
    attributes: ts.JsxAttributes,
    sourceFile: ts.SourceFile
  ): AttributeInfo[] {
    const result: AttributeInfo[] = [];

    for (const prop of attributes.properties) {
      if (ts.isJsxAttribute(prop)) {
        const name = this.getAttributeName(prop.name);
        let value: string | null = null;

        if (prop.initializer) {
          if (ts.isStringLiteral(prop.initializer)) {
            value = prop.initializer.text;
          } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
            if (ts.isStringLiteral(prop.initializer.expression)) {
              value = prop.initializer.expression.text;
            }
          }
        }

        const { line, character } = sourceFile.getLineAndCharacterOfPosition(prop.getStart());

        result.push({
          name,
          value,
          line: line + 1,
          column: character + 1
        });
      }
    }

    return result;
  }

  /**
   * Extract text content from JSX children
   */
  private extractTextContent(children: ts.NodeArray<ts.JsxChild>): string | null {
    const texts: string[] = [];

    for (const child of children) {
      if (ts.isJsxText(child)) {
        const text = child.text.trim();
        if (text) {
          texts.push(text);
        }
      }
    }

    return texts.length > 0 ? texts.join(' ') : null;
  }

  /**
   * Extract string literal information
   */
  private extractStringLiteral(
    node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
    sourceFile: ts.SourceFile
  ): StringLiteralInfo | null {
    const value = node.text;
    if (!value) {
      return null;
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const context = this.determineStringContext(node);

    return {
      value,
      line: line + 1,
      column: character + 1,
      context,
      parentContext: this.getParentContext(node)
    };
  }

  /**
   * Extract template literal information
   */
  private extractTemplateLiteral(
    node: ts.TemplateExpression,
    sourceFile: ts.SourceFile
  ): StringLiteralInfo | null {
    // Get the full template text (head + spans)
    const parts: string[] = [node.head.text];
    for (const span of node.templateSpans) {
      parts.push(span.literal.text);
    }
    const value = parts.join('${...}');

    if (!value.trim()) {
      return null;
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

    return {
      value,
      line: line + 1,
      column: character + 1,
      context: 'template-literal'
    };
  }

  /**
   * Determine the context of a string literal
   */
  private determineStringContext(node: ts.Node): StringContext {
    const parent = node.parent;

    if (!parent) {
      return 'other';
    }

    // JSX attribute value
    if (ts.isJsxAttribute(parent)) {
      return 'jsx-attribute';
    }

    // JSX expression in attribute
    if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
      return 'jsx-attribute';
    }

    // Variable declaration
    if (ts.isVariableDeclaration(parent)) {
      return 'variable';
    }

    // Function call argument
    if (ts.isCallExpression(parent)) {
      return 'function-call';
    }

    return 'other';
  }

  /**
   * Get parent context information (e.g., attribute name)
   */
  private getParentContext(node: ts.Node): string | undefined {
    const parent = node.parent;

    if (!parent) {
      return undefined;
    }

    // JSX attribute - return attribute name
    if (ts.isJsxAttribute(parent)) {
      return this.getAttributeName(parent.name);
    }

    // JSX expression in attribute
    if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
      return this.getAttributeName(parent.parent.name);
    }

    // Call expression - return function name
    if (ts.isCallExpression(parent)) {
      const expression = parent.expression;
      if (ts.isIdentifier(expression)) {
        return expression.text;
      }
      if (ts.isPropertyAccessExpression(expression)) {
        return expression.name.text;
      }
    }

    return undefined;
  }

  /**
   * Get attribute name from JSX attribute name node
   */
  private getAttributeName(name: ts.JsxAttributeName): string {
    if (ts.isIdentifier(name)) {
      return name.text;
    }
    // JsxNamespacedName (e.g., xml:lang)
    return name.getText();
  }
}
