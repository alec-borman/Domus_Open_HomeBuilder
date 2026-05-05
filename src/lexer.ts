import { Token } from './ast.js';

const KEYWORDS = new Set([
  'domus', 'context', 'trait', 'def', 'goal', 'building',
  'floor', 'zone', 'perimeter', 'optimize', 'geo',
  'assembly', 'max', 'min', 'when', 'mat', 'import'
]);

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];
  private input: string;

  constructor(input: string) {
    this.input = input;
  }

  private cp(): number {
    return this.input.codePointAt(this.pos) ?? 0;
  }

  private advanceCodePoint(): string {
    const cp = this.cp();
    const char = String.fromCodePoint(cp);
    this.pos += char.length; // 0-based absolute index, measures in UTF-16 code units 
    if (char === '\n') {
      this.line++;
      this.col = 1;
    } else if (char === '\r') {
      this.col += 1;
    } else {
      this.col += char.length; // LSP offsets treat columns by code units
    }
    return char;
  }

  private isDigit(cp: number): boolean {
    return cp >= 0x0030 && cp <= 0x0039;
  }

  private isAlpha(cp: number): boolean {
    if (cp >= 0x0041 && cp <= 0x005A) return true; // A-Z
    if (cp >= 0x0061 && cp <= 0x007A) return true; // a-z
    if (cp >= 0x00C0) {
      if (cp === 0x00D7 || cp === 0x00F7) return false;
      return true;
    }
    return false;
  }

  public tokenize(): Token[] {
    while (this.pos < this.input.length) {
      const startPos = this.pos;
      const startLine = this.line;
      const startCol = this.col;
      const cp = this.cp();
      const char = String.fromCodePoint(cp);

      // Whitespace
      if (cp === 0x0020 || cp === 0x0009 || cp === 0x000A || cp === 0x000D) {
        let val = this.advanceCodePoint();
        while (this.pos < this.input.length) {
          const nextCp = this.cp();
          if (nextCp === 0x0020 || nextCp === 0x0009 || nextCp === 0x000A || nextCp === 0x000D) {
            val += this.advanceCodePoint();
          } else {
            break;
          }
        }
        this.tokens.push({ type: 'Whitespace', value: val, line: startLine, col: startCol, start: startPos, end: this.pos });
        continue;
      }

      // Comment
      if (this.input.startsWith('//', this.pos)) {
        let val = this.advanceCodePoint() + this.advanceCodePoint(); // consume '//'
        while (this.pos < this.input.length) {
          const c = this.cp();
          if (c === 0x000A || c === 0x000D) {
            break; // Stop before newline
          }
          val += this.advanceCodePoint();
        }
        this.tokens.push({ type: 'Comment', value: val, line: startLine, col: startCol, start: startPos, end: this.pos });
        continue;
      }

      // Multi-char Punctuation
      const multiList = [':=', '~>', '@[', '#[', '<=', '>=', '::'];
      let matchedMulti = false;
      for (const m of multiList) {
        if (this.input.startsWith(m, this.pos)) {
          let val = '';
          for (let i = 0; i < m.length; i++) val += this.advanceCodePoint();
          this.tokens.push({ type: 'Punctuation', value: val, line: startLine, col: startCol, start: startPos, end: this.pos });
          matchedMulti = true;
          break;
        }
      }
      if (matchedMulti) continue;

      // Single-char Punctuation
      const singleList = ['.', ',', ':', '=', '<', '>', '[', ']', '{', '}', '(', ')', '~', '@', '#', '-', '+', '*', '/'];
      if (singleList.includes(char)) {
        this.tokens.push({ type: 'Punctuation', value: this.advanceCodePoint(), line: startLine, col: startCol, start: startPos, end: this.pos });
        continue;
      }

      // String
      if (char === '"') {
        let val = this.advanceCodePoint();
        let closed = false;
        while (this.pos < this.input.length) {
          const nextChar = this.advanceCodePoint();
          val += nextChar;
          if (nextChar === '"') {
            closed = true;
            break;
          }
          if (nextChar === '\\' && this.pos < this.input.length) {
            val += this.advanceCodePoint();
          }
        }
        this.tokens.push({ type: 'String', value: val, line: startLine, col: startCol, start: startPos, end: this.pos });
        continue;
      }

      // Number & Unit
      if (this.isDigit(cp)) {
        let val = this.advanceCodePoint(); // consume first digit
        while (this.pos < this.input.length && this.isDigit(this.cp())) {
          val += this.advanceCodePoint();
        }

        // Decimal
        if (this.cp() === 0x002E) { // .
          const nextCp = this.input.codePointAt(this.pos + 1);
          if (nextCp && this.isDigit(nextCp)) {
            val += this.advanceCodePoint(); // consume .
            while (this.pos < this.input.length && this.isDigit(this.cp())) {
              val += this.advanceCodePoint();
            }
          }
        }

        // Unit suffix
        const isUnitDelim = this.cp() === 0x002E || this.cp() === 0x005F; // . or _
        const nextCp = this.input.codePointAt(this.pos + 1);
        if (isUnitDelim && nextCp && (this.isAlpha(nextCp) || this.isDigit(nextCp))) {
          val += this.advanceCodePoint(); // consume delimiter
          while (this.pos < this.input.length && (this.isAlpha(this.cp()) || this.isDigit(this.cp()) || this.cp() === 0x005F)) {
            val += this.advanceCodePoint();
          }
        }

        this.tokens.push({ type: 'Number', value: val, line: startLine, col: startCol, start: startPos, end: this.pos });
        continue;
      }

      // Identifier / Keyword
      if (this.isAlpha(cp) || cp === 0x005F) { // alpha or _
        let val = this.advanceCodePoint();
        while (this.pos < this.input.length && (this.isAlpha(this.cp()) || this.isDigit(this.cp()) || this.cp() === 0x005F)) {
          val += this.advanceCodePoint();
        }
        const type = KEYWORDS.has(val) ? 'Keyword' : 'Identifier';
        this.tokens.push({ type, value: val, line: startLine, col: startCol, start: startPos, end: this.pos });
        continue;
      }

      // Invalid
      this.tokens.push({ type: 'Invalid', value: this.advanceCodePoint(), line: startLine, col: startCol, start: startPos, end: this.pos });
    }

    this.tokens.push({ type: 'EOF', value: '', line: this.line, col: this.col, start: this.pos, end: this.pos });
    return this.tokens;
  }
}
