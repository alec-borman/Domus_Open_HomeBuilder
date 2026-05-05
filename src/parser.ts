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

  function checkUnresolved(identifier: string, token: Token, obj?: any) {
      if (!declaredNames.has(identifier)) {
          if (!['umo', 'geo', 'optimize', 'maximize_solar_gain', 'hvac', 'site', 'perimeter', 'ft', 'm', 'kg_m3', 'MPa', 'W_m2K', 'pcf', 'psi'].includes(identifier)) {
              report('E003', `Undeclared identifier reference: ${identifier}`, token);
              if (obj) obj.unresolved = true;
          }
      }
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
      let depth = 1;
      while (pos < tokens.length) {
        const t = advance();
        if (t.value === '[') depth++;
        if (t.value === ']') depth--;
        if (depth === 0) break;
        inner.push(t);
      }
      const endTok = tokens[pos-1];
      annotations.push({ type: 'Annotation', start: startTok.start, end: endTok.end, inner });
    }
    return annotations;
  }

  function parseGenericBlock(type: string, props?: any): CSTNode {
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
            let depth = 1;
            while(pos < tokens.length) {
                const nextVal = peek().value;
                if (nextVal === '[') depth++;
                if (nextVal === ']') depth--;
                advance();
                if (depth === 0) break;
            }
         } else if (match('Keyword', 'floor')) {
            const kwTok = tokens[pos-1];
            const levelTok = expect('Number');
            let levelVal = Number(levelTok.value);
            if (isNaN(levelVal)) levelVal = levelTok.value as any;
            const b = parseGenericBlock('Floor', { level: levelVal, start: annotations.length > 0 ? annotations[0].start : kwTok.start });
            b.annotations = annotations;
            body.push(b);
         } else if (match('Keyword', 'zone')) {
            const kwTok = tokens[pos-1];
            const nameTok = expect('String');
            const rawName = nameTok.value.replace(/"/g, '');
            const b = parseGenericBlock('Zone', { name: rawName, start: annotations.length > 0 ? annotations[0].start : kwTok.start });
            b.annotations = annotations;
            body.push(b);
         } else if (match('Keyword', 'perimeter') || match('Keyword', 'when')) {
            const kwTok = tokens[pos-1];
            const b = parseGenericBlock('NestedBlock', { start: annotations.length > 0 ? annotations[0].start : kwTok.start });
            b.annotations = annotations;
            body.push(b);
         } else if (match('Identifier') || match('Keyword')) {
            const idTok = tokens[pos-1];
            let isProperty = false;
            let tmpPos = pos;
            while (tmpPos < tokens.length && (tokens[tmpPos].type === 'Whitespace' || tokens[tmpPos].type === 'Comment')) {
                tmpPos++;
            }
            let pk = tokens[tmpPos];
            if (pk && (pk.value === ':' || pk.value === ':=')) {
                isProperty = true;
            }
            if (idTok.type === 'Identifier' && !isProperty) {
                checkUnresolved(idTok.value, idTok);
            }
            
            let isRhs = false;
            let prevValue = '';
            while (pos < tokens.length) {
                const next = tokens[pos];
                if (next.type === 'Whitespace' || next.type === 'Comment') { 
                    if (next.value.includes('\\n')) {
                        break;
                    }
                    advance(); 
                    continue; 
                }
                if (next.value === '{') {
                    parseGenericBlock('NestedBlock');
                    break;
                }
                if (next.type === 'Whitespace' && next.value.includes('\\n')) break;
                if (next.value === '}') break;
                const adv = advance();
                
                if (adv.value === ':' || adv.value === '=' || adv.value === ':=') {
                    isRhs = true;
                } else if (adv.type === 'Identifier') {
                    let tmpPos2 = pos;
                    while (tmpPos2 < tokens.length && (tokens[tmpPos2].type === 'Whitespace' || tokens[tmpPos2].type === 'Comment')) {
                        tmpPos2++;
                    }
                    let nextPk = tokens[tmpPos2];
                    let isCurrentProperty = nextPk && (nextPk.value === ':' || nextPk.value === ':=');
                    let isPropAccess = (prevValue === '.');
                    if (!isPropAccess) {
                        if (!isCurrentProperty || isRhs) {
                             if (!isCurrentProperty || nextPk?.value === '::') {
                                 checkUnresolved(adv.value, adv);
                             }
                        }
                    }
                }
                if (adv.type !== 'Whitespace' && adv.type !== 'Comment') {
                    prevValue = adv.value;
                }
            }
         } else {
            advance();
         }
     }
     
     const endTok = expect('Punctuation', '}', 'E002');
     const ret: any = { type, start: startTok.start, end: endTok.end, body };
     if (props) Object.assign(ret, props);
     return ret;
  }

  function parseBuilding(): CSTNode {
      const nameTok = expect('String');
      let rawName = nameTok ? nameTok.value.replace(/"/g, '') : '';
      if (nameTok && nameTok.value) {
          if (declaredNames.has(rawName)) report('E004', 'Duplicate declaration', nameTok);
          declaredNames.add(rawName);
      }
      return parseGenericBlock('Building', { name: rawName });
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
      return parseGenericBlock('Def', { name: nameTok ? nameTok.value : '' });
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
