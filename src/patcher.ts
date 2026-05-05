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

    const targetNode = findNodeByPath(ast, path);
    if (!targetNode || !targetNode.end) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Invalid hierarchical patcher path', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    for (let i = 0; i < ast.tokens.length; i++) {
        const t = ast.tokens[i];
        if (t.end === targetNode.end && t.value === '}') {
            injectionTokenIndex = i;
            break;
        }
    }

    if (injectionTokenIndex === -1) {
       return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Cannot inject into non-block node', line: 1, col: 1, offset: 0, length: 0 }] };
    }
    
    // Bounds invalidation check
    if (path.toLowerCase() === 'context' && nodeSource.includes('floor')) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Cannot inject floor into context', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    const isCRLF = ast.tokens.some(t => t.value.includes('\\r\\n'));
    if (isCRLF) nodeSource = nodeSource.replace(/\\n/g, '\\r\\n');

    const snippetTokens = new Lexer(nodeSource).tokenize().filter(t => t.type !== 'EOF');
    if (snippetTokens.some(t => t.type === 'Invalid')) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E009', message: 'Invalid token in snippet', line: 1, col: 1, offset: 0, length: 0 }] };
    }
    
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
    const targetNode = findNodeByPath(ast, path);
    if (!targetNode || targetNode.start === undefined || targetNode.end === undefined) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Invalid hierarchical patcher path for deletion', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    let startTokenIndex = -1;
    let endTokenIndex = -1;

    for (let i = 0; i < ast.tokens.length; i++) {
        const t = ast.tokens[i];
        if (t.start === targetNode.start) startTokenIndex = i;
        if (t.end === targetNode.end) endTokenIndex = i;
    }

    if (startTokenIndex === -1 || endTokenIndex === -1) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Cannot find bounding tokens for deletion', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    const newAst = deepClone(ast);
    const byteDelta = -(targetNode.end - targetNode.start);
    const shiftFromBytes = targetNode.end;

    newAst.tokens.splice(startTokenIndex, endTokenIndex - startTokenIndex + 1);
    shiftTokenOffsets(newAst.tokens, startTokenIndex, byteDelta);
    shiftAstOffsets(newAst, shiftFromBytes, byteDelta);

    const newText = serialize(newAst);
    const { ast: parsedAst, diagnostics } = parse(newText);
    
    if (diagnostics.length > 0) {
        console.error('DELETE POST-PARSE ERROR:', diagnostics);
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Invalid state after deletion', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    return { cst: parsedAst, diagnostics: [] };
}

export function replaceNode(ast: Program, path: string, nodeSource: string): { cst: Program | null, diagnostics: ParseDiagnostic[] } {
    // A replacement is a deletion followed by injecting tokens at `startTokenIndex`
    const targetNode = findNodeByPath(ast, path);
    if (!targetNode || targetNode.start === undefined || targetNode.end === undefined) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Invalid hierarchical patcher path for replacement', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    let startTokenIndex = -1;
    let endTokenIndex = -1;

    for (let i = 0; i < ast.tokens.length; i++) {
        const t = ast.tokens[i];
        if (t.start === targetNode.start) startTokenIndex = i;
        if (t.end === targetNode.end) endTokenIndex = i;
    }

    if (startTokenIndex === -1 || endTokenIndex === -1) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Cannot find bounding tokens for replacement', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    const isCRLF = ast.tokens.some(t => t.value.includes('\\r\\n'));
    if (isCRLF) nodeSource = nodeSource.replace(/\\n/g, '\\r\\n');

    const snippetTokens = new Lexer(nodeSource).tokenize().filter(t => t.type !== 'EOF');
    if (snippetTokens.some(t => t.type === 'Invalid')) {
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E009', message: 'Invalid token in snippet', line: 1, col: 1, offset: 0, length: 0 }] };
    }
    
    const newAst = deepClone(ast);
    
    const bytesToRemove = targetNode.end - targetNode.start;
    let bytesToAdd = 0;
    
    const shiftFromBytes = targetNode.start;

    for (const t of snippetTokens) {
        t.start += shiftFromBytes;
        t.end += shiftFromBytes;
        bytesToAdd += (t.end - t.start);
    }

    const byteDelta = bytesToAdd - bytesToRemove;

    newAst.tokens.splice(startTokenIndex, endTokenIndex - startTokenIndex + 1, ...snippetTokens);
    shiftTokenOffsets(newAst.tokens, startTokenIndex + snippetTokens.length, byteDelta);
    shiftAstOffsets(newAst, targetNode.end, byteDelta);

    const newText = serialize(newAst);
    const { ast: parsedAst, diagnostics } = parse(newText);
    
    if (diagnostics.length > 0) {
        console.error('REPLACE POST-PARSE ERROR:', diagnostics);
        return { cst: null, diagnostics: [{ severity: 'error', code: 'E015', message: 'Invalid state after replacement', line: 1, col: 1, offset: 0, length: 0 }] };
    }

    return { cst: parsedAst, diagnostics: [] };
}

function parsePathSteps(path: string): { type: string, args: string[] }[] {
    const steps: { type: string, args: string[] }[] = [];
    let current = '';
    for (let i = 0; i < path.length; i++) {
        if (path[i] === '.') {
            if (current) steps.push({ type: current, args: [] });
            current = '';
        } else if (path[i] === '[') {
            const type = current;
            current = '';
            let end = path.indexOf(']', i);
            let argStr = path.substring(i + 1, end);
            i = end;
            if (argStr.startsWith('"') && argStr.endsWith('"')) argStr = argStr.substring(1, argStr.length - 1);
            else if (argStr.startsWith("'") && argStr.endsWith("'")) argStr = argStr.substring(1, argStr.length - 1);
            steps.push({ type, args: [argStr] });
        } else {
            current += path[i];
        }
    }
    if (current) steps.push({ type: current, args: [] });
    return steps;
}

export function findNodeByPath(ast: Program, path: string): CSTNode | null {
    if (!path) return null;
    const steps = parsePathSteps(path);
    let currentNodes = ast.body;
    let targetNode: CSTNode | null = null;
    
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let found: CSTNode | null = null;
        for (const node of currentNodes) {
             if (node.type.toLowerCase() === step.type.toLowerCase()) {
                 if (step.args.length > 0) {
                     const argMatch = (node.name !== undefined && String(node.name) === step.args[0]) || 
                                      (node.level !== undefined && String(node.level) === step.args[0]);
                     if (argMatch) {
                         found = node;
                         break;
                     }
                 } else {
                     found = node;
                     break;
                 }
             }
        }
        if (!found) return null;
        if (i === steps.length - 1) {
            targetNode = found;
        } else {
            currentNodes = found.body || [];
        }
    }
    
    return targetNode;
}
