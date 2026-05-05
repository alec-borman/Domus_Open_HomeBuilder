# SPEC.md v4.0.0 — The Global Axiom Edition

## 𝄆 DOMUS CORE: THE CANONICAL LANGUAGE ENGINE 𝄇

**Version:** 4.0.0 (The Global Axiom Edition)  
**Status:** Normative / Open‑Source Constitution  
**License:** Apache 2.0  
**Domain:** Computational Architecture, Lexical Analysis, Recursive‑Descent Parsing, Lossless CST Generation, Bidirectional Patching  
**Repository:** `domus-core` — The deterministic, zero‑dependency, isomorphic, open‑source compiler frontend for the global Domus DSL.  

---

### 1. ARCHITECTURAL PRIME DIRECTIVES

The implementer SHALL treat the following directives as absolute, non‑negotiable constraints. Violation of any directive SHALL be considered a failure of the implementation. The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

| Directive | Requirement |
|-----------|-------------|
| **D1. ZERO DEPENDENCIES** | `domus-core` MUST be a pure TypeScript library. The implementer SHALL NOT import any runtime dependency beyond the ECMAScript standard library. Only `devDependencies` (e.g., `typescript`, `vitest`) are permitted. |
| **D2. ISOMORPHIC EXECUTION** | The library MUST execute identically in Node.js, Deno, Bun, Cloudflare Workers, and all modern web browsers. The implementer SHALL NOT use any runtime‑specific API (e.g., `fs`, `path`, `process`, `Buffer`). |
| **D3. GLOBAL CHARACTER SCANNING** | The lexer MUST use hand‑written character scanning iterating over **Unicode code points**, NOT UTF-16 code units. Regular expressions SHALL NOT be used for tokenization. Multi-byte characters (e.g., Kanji, Arabic, Emojis) MUST be parsed without truncating surrogate pairs. |
| **D4. LINEAR TIME COMPLEXITY** | The parser MUST operate in `O(n)` time for valid input, where `n` is the number of characters in the source. Pathological inputs MAY degrade gracefully but SHALL NOT exhibit exponential or super‑linear blowup. |
| **D5. LOSSLESS CST & LINE-ENDING FIDELITY** | The parser MUST preserve ALL trivia: whitespace, newlines (`\n` vs `\r\n`), and comments. A parsed CST serialized back to text MUST produce a string byte‑for‑byte identical to the original UTF-8 input. |
| **D6. NON‑FATAL ERROR RECOVERY** | The parser SHALL NOT throw an unhandled exception. On encountering invalid syntax, it MUST record a `ParseDiagnostic` of severity `"error"`, skip to the next recognizable top‑level keyword (`context`, `trait`, `def`, `goal`, `building`), and resume parsing. The skipped region SHALL be included as an `ErrorBlock` node. |
| **D7. LSP COORDINATE SYSTEM** | All `line` and `col` values in tokens, nodes, and diagnostics MUST be 1‑based, matching the Language Server Protocol (LSP) and Monaco editor convention. `offset` and `length` are 0‑based character indices. |
| **D8. UNIVERSAL DECIMAL STANDARD** | The parser MUST strictly evaluate numeric values using `.` as the decimal separator. Locale-dependent separators (e.g., `,` for decimals in Europe) MUST NOT be evaluated as decimals to prevent ambiguous parsing of global dimension arrays. |

---

### 2. LEXICAL ANALYSIS

The Lexer SHALL convert a raw UTF‑8 string into a flat array of `Token` objects.

#### 2.1 Token Interface

```typescript
interface Token {
  type:   'Keyword' | 'Identifier' | 'Number' | 'String' | 'Punctuation'
        | 'Whitespace' | 'Comment' | 'Invalid' | 'EOF';
  value:  string;          // exact source text
  line:   number;          // 1‑based
  col:    number;          // 1‑based
  start:  number;          // 0‑based absolute index
  end:    number;          // 0‑based absolute index, exclusive
}
```

#### 2.2 Tokenization Rules

| Rule | Description |
|------|-------------|
| **R1. Trivia Preservation** | The lexer SHALL emit `Whitespace` tokens for every contiguous run of spaces, tabs, and newlines. It SHALL emit `Comment` tokens for every `// ...` line comment. No trivia SHALL be discarded. |
| **R2. Multi‑Character Operators** | The lexer SHALL greedily match the following multi-character `Punctuation` tokens BEFORE checking single characters: `:=`, `~>`, `@[`, `#[`, `<=`, `>=`, `::`. |
| **R3. Universal Unit Binding** | Numeric literals (digits and an optional `.` decimal) followed by a unit suffix delimiter (`.` or `_`) and an alphanumeric unit string (e.g., `450.kg_m3`, `24.5.MPa`, `1.2_W_m2K`, `30.ft`) SHALL be emitted as a single `Number` token. The implementer MUST NOT maintain a whitelist of allowed units; any continuous alphanumeric sequence following the unit delimiter is valid lexically. |
| **R4. Keyword Recognition** | The lexer SHALL recognize the following exact ASCII sequences as `Keyword` tokens: `domus`, `context`, `trait`, `def`, `goal`, `building`, `floor`, `zone`, `perimeter`, `optimize`, `geo`, `assembly`, `max`, `min`, `when`, `mat`, `import`. |
| **R5. Invalid Character Handling** | Any character not matched by a tokenization rule SHALL be emitted as an `Invalid` token. A `ParseDiagnostic` of severity `"error"` MUST be recorded. The lexer SHALL NOT halt. |

#### 2.3 Lexer Output Contract

The token array SHALL end with exactly one `EOF` token. The concatenation of all `token.value` strings (excluding `EOF`) MUST strictly equal the original source text. The implementer SHALL verify this invariant via hash-matching tests.

---

### 3. SYNTAX ANALYSIS

The Parser SHALL consume the token stream and produce a `Program` CST node. It SHALL use a top‑down recursive‑descent algorithm without backtracking where possible.

#### 3.1 CST Node Interface

```typescript
interface CSTNode {
  type: string;
  start: number;    // 0‑based
  end: number;      // 0‑based, exclusive
  [key: string]: any;
}

interface Program extends CSTNode {
  type: 'Program';
  version: string;
  body: CSTNode[];
  tokens: Token[];
}

interface ParseDiagnostic {
  severity: 'error' | 'warning';
  code: string;      // Normative error code
  message: string;
  line: number;      // 1‑based
  col: number;       // 1‑based
  offset: number;    // 0‑based
  length: number;    // 0‑based
}
```

#### 3.2 Parser Behavioral Requirements

| Requirement | Description |
|-------------|-------------|
| **P1. Declaration‑Before‑Use** | The parser SHALL build a flat reference map of all defined identifiers. References to undeclared identifiers SHALL produce `ParseDiagnostic` `E003`. The referencing node SHALL remain in the CST with an `unresolved: true` property to support LSP integrations. |
| **P2. Annotation Association** | `#[...]` annotations SHALL bind to the *immediately following* keyword declaration or block construct. The annotation node SHALL be attached as an array property (`annotations: CSTNode[]`) of the annotated node. Floating annotations SHALL produce `E012`. |
| **P3. Sigil Precedence** | Precedence (highest to lowest): `.` (dot access, left-associative), `:=` (binding), `~>` (pathing). `~>` SHALL permit chaining; each segment SHALL be represented as a distinct `PathSegment` CST node inside an array. |
| **P4. Call Expressions** | `identifier(args)` constructs SHALL be parsed as `CallExpression` nodes with `callee: string` and `arguments: CSTNode[]`. It MUST support comma-separated mixed scalar/vector arguments. |
| **P5. Vector & Tensor Parsing** | `[x, y]` and `[x, y, z]` constructs SHALL be parsed deterministically as `VectorExpression` or `ArrayExpression` nodes. |
| **P6. Strict Profile Fidelity** | The `profile` string value in the `context` block (e.g., `"JP-TK-Tokyo-BSL"`) SHALL be preserved with byte‑for‑byte fidelity. No lowercasing, normalization, or transformation is permitted to maintain cryptographic hashing of municipal profiles. |
| **P7. Panic-Free Recovery** | Upon catching an invalid grammatical sequence, the parser SHALL log a diagnostic, emit an `ErrorBlock` node containing the invalid tokens, advance the token index until the next top-level keyword, and resume parsing. |

#### 3.3 Universal Error Code Registry

The implementer SHALL export and use the following diagnostic codes exclusively. Ad‑hoc codes SHALL NOT be invented.

| Code | Description | Code | Description |
|------|-------------|------|-------------|
| `E001` | Missing `domus` version declaration | `E009` | Invalid UTF-8 character in source |
| `E002` | Unclosed block or string | `E010` | Unexpected token / Grammar violation |
| `E003` | Undeclared identifier reference | `E011` | Unknown UMO property key |
| `E004` | Duplicate declaration | `E012` | Invalid annotation target (Floating `#[...]`) |
| `E005` | Invalid sigil placement | `E013` | Cyclic reference/load-path detected |
| `E006` | Type / Tensor dimensionality mismatch | `E014` | Bounded state condition parse error |
| `E007` | Invalid or grammatically malformed unit | `E015` | Invalid hierarchical patcher path |
| `E008` | Unterminated string literal | `E016` | Missing global geodetic parameters |

---

### 4. DOMUS DSL SYNTAX & SEMANTIC SIGILS

#### 4.1 Main Sigils

| Sigil | CST Node Type | Binding Rule |
|-------|---------------|--------------|
| `{ }` | `Block` | Defines spatial scopes (`Building`, `Floor`, `Zone`). Nested blocks SHALL be children of their parent block. |
| `@[ key: value ]` | `TraitAssignment` | Key‑value pair within a `TraitBlock` or `AssemblyLayer`. SHALL support nested property paths (`mech.density`). |
| `#[...]` | `Annotation` | Binds to the immediately following declaration. SHALL NOT float unattached. |
| `~>` | `PathExpression` | Binary connector between two `Reference` nodes. Chaining SHALL produce an array of `PathSegment` nodes. |
| `.` | `DotAccess` | Left‑associative member access. `wall.south.window` produces nested access nodes. |
| `:=` | `GoalBinding` | Associates a property with a parametric optimization expression. |

#### 4.2 Top‑Level Constructs

The parser SHALL recognize the following as valid top‑level declarations (in any order, after the version declaration):

- `context { ... }` → `Context` node
- `trait @identifier { ... }` → `Trait` node
- `def mat identifier = umo::path { ... }` → `MaterialDefinition` node
- `def assembly identifier = assembly.type { ... }` → `AssemblyDefinition` node
- `goal identifier { ... }` → `Goal` node
- `building "name" { ... }` → `Building` node
- `import "path"` → `Import` node

---

### 5. THE UNIVERSAL MATERIAL ONTOLOGY (UMO) SCHEMAS

The implementer SHALL export the following TypeScript type definitions as the public UMO API. The taxonomy uses scientific Latin phrasing to eliminate localized naming conflicts.

#### 5.1 Phylum Enumeration

```typescript
type Phylum = 'lignocellulosica' | 'metallum' | 'cementitia'
            | 'polymerica' | 'composita' | 'biogenica';
```

#### 5.2 Material Property Schema

Every `def mat` declaration SHALL produce a CST node conforming to:

```typescript
interface MaterialDefinition extends CSTNode {
  type: 'MaterialDefinition';
  name: string;
  phylum: Phylum;
  subClass: string;
  isotope: string;
  properties: MaterialProperty[];
  boundedStates: BoundedState[];
}

interface MaterialProperty {
  key: string;               // e.g., "mech.density", "mech.E"
  value: number | number[];  // scalar or tensor array
  unit: string;              // e.g., "kg_m3", "MPa", "W_m2K"
  isRequired: boolean;       // determined by exported schema
}

interface BoundedState {
  condition: string;         // e.g., "moisture_content > 19.percent"
  overrides: MaterialProperty[];
}
```

The implementer SHALL export a `MaterialPropertySchema` map that explicitly declares every property's `type` (`scalar`, `vector`, `matrix`), allowed international `units` (supporting both SI and Imperial seamlessly), and `isRequired` boolean flag. Unknown property keys parsed inside a `def mat` SHALL be included in the CST but flagged with `E011`.

---

### 6. CST MUTATION (THE PATCHER)

The library SHALL export a `patcher` module providing immutable, mathematically sound CST transformation utilities capable of serving Language Server Protocol (LSP) edits globally.

#### 6.1 Mutator Contract

| Rule | Requirement |
|------|-------------|
| **M1. Strict Immutability** | All mutation functions SHALL return a mathematically new CST instance. The input CST SHALL NOT be modified in place. |
| **M2. Post‑Mutation Validation** | After ANY mutation, the patcher SHALL serialize the new CST to text and strictly re‑parse it. If the re‑parse produces ANY syntax errors, the mutation is REJECTED, returning a `ParseDiagnostic`. |
| **M3. Grammatical Validation** | Mutations SHALL ONLY be permitted at grammatically valid positions. Injecting a `zone` directly inside a `context` block SHALL be rejected with `E015`. |
| **M4. Line-Ending Preservation** | When injecting new nodes, the patcher SHALL detect the source file's dominant line ending (`\n` vs `\r\n`) and apply it to injected strings. |
| **M5. Hierarchical Pathing** | Targeting functions SHALL use explicit paths like `Building["Kyoto_Pavilion"].Floor[1].Zone["Atrium"]`. The bracketed key SHALL exactly match the node's natural primary identifier. |

#### 6.2 Required Exports

```typescript
function injectNode(cst: Program, path: string, nodeSource: string): { cst: Program | null; diagnostics: ParseDiagnostic[] };
function deleteNode(cst: Program, path: string): { cst: Program | null; diagnostics: ParseDiagnostic[] };
function replaceNode(cst: Program, path: string, nodeSource: string): { cst: Program | null; diagnostics: ParseDiagnostic[] };
function findNodeByPath(cst: Program, path: string): CSTNode | null;
```

---

### 7. TEST‑DRIVEN BOUNDARIES (TDB) & GLOBAL COVERAGE

The implementer SHALL strictly follow the discipline: **Read → Test First → Implement → Verify**. The test suite MUST demonstrate the engine's global resilience and achieve a 100% pass rate. Skipped (`.skip`) or commented-out tests SHALL count as failures.

#### 7.1 Mandatory Test Categories

| Category | Minimum Tests | Focus |
|----------|---------------|-------|
| **Lexer: Universal Units** | 10 | Parse `450.kg_m3`, `24.5.MPa`, `1.2_W_m2K`, `30.ft` correctly into single `Number` tokens. |
| **Lexer: Multilingual Source** | 5 | Parse strings containing Japanese (Kanji) and German (Umlauts) characters. Verify Unicode code-point alignment. |
| **Lexer: Trivia & CRLF** | 5 | Verify Whitespace, Tabs, and mixed `\n`/`\r\n` emit properly with mathematically accurate byte‑offsets. |
| **Parser: Constructs** | 10 | Parse all top-level statements including `geo()` vectors. |
| **Parser: Error Recovery** | 5 | Parse unclosed blocks, missing version. Verify NO panic, generation of `ErrorBlock` nodes, and resumption of parsing. |
| **Patcher: Invalid Bounds** | 6 | Attempt injection of a `floor` into `context`. Verify absolute rejection with `E015`. |
| **CST: Round‑Trip Fidelity** | 2 | Execute byte-for-byte serialization equality on the Canonical Fixtures. |

---

### 8. IMPLEMENTATION CONSTRAINTS

| Constraint | Description |
|------------|-------------|
| **C1. Single‑File or Minimal Modules** | The implementer MAY organize code into separate files (`lexer.ts`, `parser.ts`, `cst.ts`, `patcher.ts`) but SHALL NOT introduce superfluous abstraction layers. |
| **C2. TypeScript Strict Mode** | All source files SHALL use TypeScript `strict: true`. No implicit or explicit `any` types are permitted outside of the generic `CSTNode` dictionary index signature. |
| **C3. No Code Generation** | The implementer SHALL NOT use `eval()`, `new Function()`, or any form of runtime JS execution mechanism. |
| **C4. Encoding Handling** | The library SHALL assume UTF‑8. Byte‑order marks (BOM) at the start of input SHALL be stripped and recorded as a diagnostic of severity `"warning"`. |

---

### 9. DUAL CANONICAL FIXTURES (GLOBAL ISOMORPHISM)

The test suite MUST prove global isomorphism by successfully parsing, round-tripping, and hash-matching **BOTH** of the following fixtures representing different physical and jurisdictional realities.

#### FIXTURE A: US Imperial / North American Context
```domus
domus "1.2.0"

context {
  project: "Alpine Retreat"
  profile: "US-CO-Denver-IRC2024"
  geodetic: geo(39.739, -104.990)
}

def mat SPF_No2 = umo::lignocellulosica.sawn.spf_grade_2 {
  @[mech.density: 26.2.pcf]
  @[mech.E: [1400000, 70000, 70000].psi]
}

building "Lodge" {
  floor 1 {
    #[structural] perimeter ext_wall { width: 60.ft, depth: 40.ft }
    zone "Mech" {
      hvac.supply(loc: [10.ft, 10.ft]) ~> perimeter.shaft ~> site.main
    }
  }
}
```

#### FIXTURE B: EU Metric / Passivhaus Context (Non-ASCII)
```domus
domus "1.2.0"

context {
  project: "München Passivhaus Gebäude"
  profile: "EU-DE-Munich-Eurocode2025"
  geodetic: geo(48.135, 11.582)
}

def mat CLT_GL24h = umo::lignocellulosica.engineered.clt {
  @[mech.density: 420.0.kg_m3]
  @[mech.E: [11600.0, 300.0, 300.0].MPa]
  @[therm.lambda: 0.13.W_m2K]
}

building "Hauptgebäude" {
  floor 0 {
    #[structural] perimeter massivholz_wand { width: 18.m, depth: 12.m }
    zone "Technikraum" {
      hvac.supply(loc: [3.m, 3.m]) ~> perimeter.schacht ~> site.main
      
      perimeter.Süd.fenster {
        width := optimize(goal: maximize_solar_gain, bounds: [2.m, 4.m])
      }
    }
  }
}
```

---

### 10. VERIFICATION CRITERIA

The implementation SHALL be considered definitively complete when ALL of the following are true:

1. `npm run test` or `npx vitest run` exits with code `0` and reports a 100% pass rate.
2. No test is skipped, commented out, or dummied.
3. BOTH Canonical Global Examples (Section 9) parse without a single `ParseDiagnostic` error.
4. The parsed CST of both fixtures serializes back to strings that are byte‑for‑byte identical to the raw inputs, validating lossless structural preservation.
5. The test suite proves global unit parsing (`kg_m3`, `MPa`, `W_m2K`), UTF-8 comment integrity, and strict DBU (Declaration-Before-Use) compliance.
6. The compiled `package.json` contains strictly zero external runtime dependencies beyond `devDependencies`.

---

**END OF SPECIFICATION.**

*This constitution represents the Absolute Truth of the Domus engine. Do not assume jurisdiction. Do not hardcode localized constants. You are instructing the AI builder to construct the foundational lexer for the entire planet. Proceed with total compliance.*### ADDENDUM TO SPEC.md v4.0.0

## 11\. THE COMMAND LINE INTERFACE (THE OPEN CORE BINDING)

The open-source release of `domus-core` is strictly a headless library and CLI binary. It provides zero graphical user interface. Graphical User Interfaces (GUIs), 3D renderers, and proprietary solvers are EXPLICITLY OUT OF SCOPE. The implementer SHALL export a CLI entry point (`src/cli.ts`) exposed via the `bin` field in `package.json`.

### 11.1 Standard Streams & Exit Codes

The CLI MUST adhere to POSIX standards for standard streams and exit codes:

  - **`stdout`:** Used strictly for requested data outputs (e.g., serialized JSON, formatted text).
  - **`stderr`:** Used strictly for `ParseDiagnostic` outputs, warnings, and errors.
  - **Exit Code 0:** Execution succeeded without grammatical `error` diagnostics.
  - **Exit Code 1:** Execution failed or parsed file contained grammatical `error` diagnostics.

### 11.2 Supported Commands

The CLI SHALL implement the following sub-commands:

| Command | Usage & Output |
| :--- | :--- |
| **`check`** | `domus check <file.domus>`<br>Parses the file. If valid, outputs `[OK] <file> passed syntax validation` and exits `0`. If invalid, prints formatted `ParseDiagnostic` messages to `stderr` and exits `1`. |
| **`parse`** | `domus parse <file.domus>`<br>Parses the file and outputs the fully serialized Abstract Syntax Tree (CST) as formatted JSON to `stdout`. Exits `1` if diagnostics are found. |
| **`patch`** | `domus patch <file.domus> <target_path> <snippet>`<br>Executes a headless CST mutation. Outputs the modified `.domus` file text to `stdout` (lossless serialization). Exits `1` with diagnostics if the patch produces invalid grammar. |
| **`format`** | `domus format <file.domus>`<br>Parses the file and reserializes it, proving the lossless CST. Outputs formatted text to `stdout`. |

### 11.3 CLI Implementation Constraints

  * **No Heavy Frameworks:** The CLI MUST be built using native Node argument parsing (e.g., `process.argv` or `util.parseArgs`) or a zero-dependency argument parser written from scratch. Frameworks like `commander`, `yargs`, or `chalk` are explicitly banned to maintain the **Directive D1 (Zero Dependencies)** mandate.
  * **Isomorphic Core Isolation:** The CLI entry point MAY use `node:fs` and `node:process` because it is the specific Node.js execution wrapper, but the core parsing logic (`lexer.ts`, `parser.ts`, `patcher.ts`) imported by the CLI MUST remain completely isomorphic (unaware of the file system).

### 11.4 Package.json Contract

The implementer SHALL configure `package.json` to expose the binary:

```json
{
  "name": "domus-core",
  "version": "4.0.0",
  "description": "Deterministic open-source compiler frontend for the Domus DSL",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "domus": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0"
  }
}
```
