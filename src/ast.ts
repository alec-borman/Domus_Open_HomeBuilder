export interface Token {
  type: 'Keyword' | 'Identifier' | 'Number' | 'String' | 'Punctuation' | 'Whitespace' | 'Comment' | 'Invalid' | 'EOF';
  value: string;
  line: number;
  col: number;
  start: number;
  end: number;
}

export interface CSTNode {
  type: string;
  start: number;
  end: number;
  [key: string]: any;
}

export interface Program extends CSTNode {
  type: 'Program';
  version: string;
  body: CSTNode[];
  tokens: Token[];
}

export interface ParseDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  line: number;
  col: number;
  offset: number;
  length: number;
}

export type Phylum = 'lignocellulosica' | 'metallum' | 'cementitia' | 'polymerica' | 'composita' | 'biogenica';

export interface MaterialProperty {
  key: string;
  value: number | number[];
  unit: string;
  isRequired: boolean;
}

export interface BoundedState {
  condition: string;
  overrides: MaterialProperty[];
}

export interface MaterialDefinition extends CSTNode {
  type: 'MaterialDefinition';
  name: string;
  phylum: Phylum;
  subClass: string;
  isotope: string;
  properties: MaterialProperty[];
  boundedStates: BoundedState[];
}
