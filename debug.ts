import { Lexer } from './src/lexer.js';
console.log(new Lexer('@[therm.lambda: 0.13.W_m2K]').tokenize().slice(0, 5));
