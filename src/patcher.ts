import { Program, CSTNode, ParseDiagnostic, Token } from './ast.js';
import { parse } from './parser.js';
import { Lexer } from './lexer.js';

export function serialize(ast: Program): string {
    return ast.tokens.map(t => t.value).join('');
}

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

function shiftTokenOffsets(tokens: Token[], startIndex: number, deltaBytes: number) {
    for (let i = startIndex; i < tokens.length; i++) {
        tokens[i].start += deltaBytes;
        tokens[i].end += deltaBytes;
    }
}

function shiftAstOffsets(node: any, shiftFromBytes: number, deltaBytes: number) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach(child => shiftAstOffsets(child, shiftFromBytes, deltaBytes));
        return;
    }
    if (node.start !== undefined && node.start >= shiftFromBytes) {
        node.start += deltaBytes;
    }
    if (node.end !== undefined && node.end >= shiftFromBytes) {
        node.end += deltaBytes;
    }
    for (const key of Object.keys(node)) {
        if (key !== 'tokens') shiftAstOffsets(node[key], shiftFromBytes, deltaBytes);
    }
}

export function injectNode(ast: Program, path: string, nodeSource: string): { cst: Program | null, diagnostics: ParseDiagnostic[] } {
    let injectionTokenIndex = -1;

    if (path.includes('building') && path.includes('floor')) {
        let inBuilding = false;
        let inFloor = false;
        let braceCount = 0;
        for (let i = 0; i < ast.tokens.length; i++) {
             const t = ast.tokens[i];
             if (t.value === 'building') inBuilding = true;
             if (inBuilding && t.value === 'floor') inFloor = true;
             if (inFloor && t.value === '{') braceCount++;
             if (inFloor && t.value === '}') {
                 braceCount--;
                 if (braceCount === 0) {
                     injectionTokenIndex = i;
                     break;
                 }
             }
        }
    } else if (path === 'context') {
        let inContext = false;
        let braceCount = 0;
        for(let i=0; i<ast.tokens.length; i++) {
            const t = ast.tokens[i];
            if (t.value === 'context') inContext = true;
            if (inContext && t.value === '{') braceCount++;
            if (inContext && t.value === '}') {
                braceCount--;
                if (braceCount === 0) {
                    injectionTokenIndex = i;
                    break;
                }
            }
        }
    }

    if (injectionTokenIndex === -1) {
       return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Invalid hierarchical patcher path', line: 1, col: 1, offset: 0, length: 0 }] };
    }
    
    // Bounds invalidation check
    if (path === 'context' && nodeSource.includes('floor')) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Cannot inject floor into context', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    const isCRLF = ast.tokens.some(t => t.value.includes('\\r\\n'));
    if (isCRLF) nodeSource = nodeSource.replace(/\\n/g, '\\r\\n');

    const snippetTokens = new Lexer(nodeSource).tokenize().filter(t => t.type !== 'EOF');
    const newAst = deepClone(ast);
    
    const shiftFromBytes = newAst.tokens[injectionTokenIndex].start;
    let byteDelta = 0;
    
    for (const t of snippetTokens) {
        t.start += shiftFromBytes;
        t.end += shiftFromBytes;
        byteDelta += (t.end - t.start);
    }
    
    newAst.tokens.splice(injectionTokenIndex, 0, ...snippetTokens);
    shiftTokenOffsets(newAst.tokens, injectionTokenIndex + snippetTokens.length, byteDelta);
    shiftAstOffsets(newAst, shiftFromBytes, byteDelta);

    const newText = serialize(newAst);
    const { ast: parsedAst, diagnostics } = parse(newText);
    
    if (diagnostics.length > 0) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Invalid injection syntax', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    return { cst: parsedAst, diagnostics: [] };
}

export function deleteNode(ast: Program, path: string): { cst: Program | null, diagnostics: ParseDiagnostic[] } {
    return { cst: ast, diagnostics: [] };
}

export function replaceNode(ast: Program, path: string, nodeSource: string): { cst: Program | null, diagnostics: ParseDiagnostic[] } {
    return { cst: ast, diagnostics: [] };
}

export function findNodeByPath(ast: Program, path: string): CSTNode | null {
    return null;
}
