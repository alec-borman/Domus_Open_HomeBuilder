import { Token, CSTNode, Program, ParseDiagnostic } from './ast.js';
import { Lexer } from './lexer.js';

export function parse(input: string): { ast: Program, diagnostics: ParseDiagnostic[], treeNodeCount: number } {
  const tokens = new Lexer(input).tokenize();
  const diagnostics: ParseDiagnostic[] = [];
  let pos = 0;
  let treeNodeCount = 0;
  const declaredNames = new Set<string>();

  function report(code: string, message: string, token: Token) {
    diagnostics.push({
      severity: 'error', code, message,
      line: token.line, col: token.col,
      offset: token.start, length: token.end - token.start
    });
  }

  function peek(): Token { return tokens[pos]; }
  function advance(): Token { treeNodeCount++; return tokens[pos++]; }

  function skipTrivia() {
    while (pos < tokens.length) {
      const t = peek();
      if (t.type === 'Whitespace' || t.type === 'Comment') { pos++; }
      else if (t.type === 'Invalid') {
        report('E009', 'Invalid UTF-8 character in source', t);
        pos++;
      }
      else break;
    }
  }

  function match(type: string, value?: string): Token | null {
    skipTrivia();
    if (pos >= tokens.length) return null;
    const t = peek();
    if (t.type === type && (value === undefined || t.value === value)) return advance();
    return null;
  }

  function expect(type: string, value?: string, errorCode = 'E010'): Token {
    const t = match(type, value);
    if (t) return t;
    const current = peek();
    const errTok = current || tokens[tokens.length-1];
    report(errorCode, `Expected ${value || type}, got ${current?.value || 'EOF'}`, errTok);
    return errTok;
  }

  function checkUnresolved(identifier: string, token: Token) {
      // Temporarily disabled to avoid false positives on struct properties
      // if (!declaredNames.has(identifier)) { ... }
  }

  function recover(syncKeywords: string[]) {
    const errTokens = [];
    while (pos < tokens.length && peek().type !== 'EOF') {
      if (peek().type === 'Keyword' && syncKeywords.includes(peek().value)) break;
      errTokens.push(advance());
    }
    return errTokens;
  }

  function parseAnnotations(): CSTNode[] {
    const annotations: CSTNode[] = [];
    while (match('Punctuation', '#[')) {
      const startTok = tokens[pos-1];
      const inner = [];
      while (pos < tokens.length && peek().value !== ']') {
        inner.push(advance());
      }
      const endTok = expect('Punctuation', ']');
      annotations.push({ type: 'Annotation', start: startTok.start, end: endTok.end, inner });
    }
    return annotations;
  }

  function parseGenericBlock(type: string): CSTNode {
     const startTok = tokens[pos-1];
     while (pos < tokens.length && peek().value !== '{') advance();
     expect('Punctuation', '{', 'E002');
     
     const body: CSTNode[] = [];
     while (pos < tokens.length && peek().value !== '}' && peek().type !== 'EOF') {
         skipTrivia();
         const childStart = peek();
         if (childStart.value === '}') break;

         const annotations = parseAnnotations();
         
         if (match('Punctuation', '@[')) {
            while(pos < tokens.length && peek().value !== ']') advance();
            expect('Punctuation', ']');
         } else if (match('Keyword', 'floor') || match('Keyword', 'zone') || match('Keyword', 'perimeter') || match('Keyword', 'when')) {
            const b = parseGenericBlock('NestedBlock');
            b.annotations = annotations;
            body.push(b);
         } else if (match('Identifier') || match('Keyword')) {
            const idTok = tokens[pos-1];
            if (idTok.type === 'Identifier') checkUnresolved(idTok.value, idTok);
            while (pos < tokens.length) {
                const next = peek();
                if (next.value === '{') {
                    parseGenericBlock('NestedBlock');
                    break;
                }
                if (next.type === 'Whitespace' && next.value.includes('\\n')) break;
                if (next.value === '}') break;
                const adv = advance();
                if (adv.type === 'Identifier') checkUnresolved(adv.value, adv);
            }
         } else {
            advance();
         }
     }
     
     const endTok = expect('Punctuation', '}', 'E002');
     return { type, start: startTok.start, end: endTok.end, body };
  }

  function parseBuilding(): CSTNode {
      const nameTok = expect('String');
      if (nameTok && nameTok.value) {
          const rawName = nameTok.value.replace(/"/g, '');
          if (declaredNames.has(rawName)) report('E004', 'Duplicate declaration', nameTok);
          declaredNames.add(rawName);
      }
      return parseGenericBlock('Building');
  }

  function parseDef(): CSTNode {
      const startTok = tokens[pos-1];
      skipTrivia();
      const typeTok = peek();
      if (typeTok.type === 'Keyword' && (typeTok.value === 'mat' || typeTok.value === 'assembly')) {
          advance();
      }
      const nameTok = expect('Identifier');
      if (nameTok && nameTok.value) {
          if (declaredNames.has(nameTok.value)) report('E004', 'Duplicate declaration', nameTok);
          declaredNames.add(nameTok.value);
      }
      expect('Punctuation', '=');
      return parseGenericBlock('MaterialDefinition');
  }

  function parseTopLevel(): CSTNode[] {
    const body: CSTNode[] = [];
    skipTrivia();
    
    if (!match('Keyword', 'domus')) {
      report('E001', 'Missing domus version declaration', peek());
    } else {
      expect('String', undefined, 'E001');
    }

    const TOP_LEVEL = ['context', 'trait', 'def', 'goal', 'building', 'import'];

    while (pos < tokens.length && peek().type !== 'EOF') {
      try {
        skipTrivia();
        if (peek().type === 'EOF') break;

        const annotations = parseAnnotations();
        if (annotations.length > 0) {
            const next = peek();
            if (next.type !== 'Keyword' || !TOP_LEVEL.includes(next.value)) {
                report('E012', 'Invalid annotation target (Floating #[...])', next);
            }
        }

        let node: any = null;
        if (match('Keyword', 'context')) node = parseGenericBlock('Context');
        else if (match('Keyword', 'building')) node = parseBuilding();
        else if (match('Keyword', 'def')) node = parseDef();
        else if (match('Keyword', 'trait')) node = parseGenericBlock('Trait');
        else if (match('Keyword', 'goal')) node = parseGenericBlock('Goal');
        else if (match('Keyword', 'import')) {
           const imp = advance(); 
           const str = expect('String');
           node = { type: 'Import', start: imp.start, end: str.end };
        } else {
           const err = advance();
           report('E010', 'Unexpected token at top level', err);
           node = { type: 'ErrorBlock', start: err.start, end: err.end };
           throw new Error("Syntax"); // trigger recovery
        }

        if (node) {
            node.annotations = annotations;
            body.push(node);
        }

      } catch (e) {
        const errTokens = recover(TOP_LEVEL);
        if (errTokens.length > 0) {
           body.push({ type: 'ErrorBlock', start: errTokens[0].start, end: errTokens[errTokens.length-1].end, tokens: errTokens });
        }
      }
    }
    return body;
  }

  const body = parseTopLevel();
  const ast: Program = {
    type: 'Program',
    version: '1.2.0',
    start: 0,
    end: input.length,
    body,
    tokens
  };

  return { ast, diagnostics, treeNodeCount };
}
