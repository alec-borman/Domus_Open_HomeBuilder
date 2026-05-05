# 𝄆 domus-core 𝄇

**The Canonical Language Engine for the Domus Protocol.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success.svg)](#)

`domus-core` is the deterministic, isomorphic, zero-dependency compiler frontend for the **Domus DSL**—a homoiconic Domain-Specific Language engineered to unify human aesthetic intent, structural mechanics, generative utility routing, and municipal jurisprudence into a singular mathematical truth.

This repository contains the **Open Core**: the lossless parser, the Universal Material Ontology (UMO) schemas, the bi-directional AST patcher, and the headless Command Line Interface (CLI).

> ⚠️ **GUI / UI Notice:** This repository is strictly headless infrastructure. Graphical User Interfaces, real-time WebGPU manifolds, Multi-Objective Resolution Engines (MORE), and Cryptographic Compliance Gateways are explicitly out of scope. If you require a visual IDE, you must license the proprietary **Domus Studio** commercial software. If you want the raw mathematical truth for free, you use the CLI.

---

## 🏛 The Philosophy: Compiling Reality

The global construction industry is paralyzed by a liability-shifting digital pipeline. Architects draw abstract lines, engineers manually prove the physics of those lines, and contractors guess material yields. 

**Domus obsoletes this entropy.** Code is Structure. Structure is Physics. Physics is Law. 

`domus-core` enforces:
1. **Zero Dependencies:** Pure TypeScript. No regex engines. Hand-written Unicode character scanning.
2. **Global Isomorphism:** Runs identically in Node.js, Deno, Bun, Cloudflare Workers, and all modern browsers.
3. **Lossless CST:** Preserves 100% of formatting, comments, and trivia. You can parse, mutate the tree, and serialize back to text with byte-for-byte fidelity.
4. **Universal Determinism:** Native support for both SI and Imperial tensor strings (`.kg_m3`, `.MPa`, `.psf`, `.ft`) with strict decimal-point parsing regardless of host OS locale.
5. **Panic-Free Architecture:** Designed for continuous Language Server Protocol (LSP) integration. Syntax errors produce rich diagnostics and isolated `ErrorBlock` nodes; the compiler never crashes.

---

## 📦 Installation

```bash
# Install globally to use the CLI
npm install -g domus-core

# Install locally as a library for tooling integrations
npm install domus-core
```

---

## ⚡ The Command Line Interface (CLI)

`domus-core` operates as a headless CLI, adhering strictly to POSIX standard streams. Data goes to `stdout`, diagnostics go to `stderr`.

```bash
# 1. Syntax & Grammar Validation
# Exits 0 if valid, 1 if grammatical errors are found.
$ domus check blueprint.domus
> [OK] blueprint.domus passed syntax validation

# 2. Extract the Abstract Syntax Tree
# Outputs the fully serialized CST as JSON to stdout.
$ domus parse blueprint.domus > ast.json

# 3. Headless Bidirectional Mutation
# Injects a snippet into a target hierarchical path and outputs the new file.
# If the patch breaks structural grammar, it exits 1 with diagnostics.
$ domus patch blueprint.domus 'Building["Lodge"].Floor[1]' "#[structural] span.beam { length: 30.ft }" > updated.domus

# 4. Format & Round-Trip Validation
# Proves the lossless serialization of the CST.
$ domus format blueprint.domus
```

---

## 🛠 The TypeScript API

Embed the compiler directly into your own CI/CD pipelines, LSP servers, or parametric generators.

```typescript
import { parse, patcher, serialize } from 'domus-core';

const source = `
domus "1.2.0"
building "Lodge" {
  floor 1 { }
}
`;

// 1. Parse into a Lossless Concrete Syntax Tree
const { ast, diagnostics } = parse(source);

if (diagnostics.length > 0) {
  console.error("Syntax Errors:", diagnostics);
}

// 2. Safely mutate the tree (Immutable, returns new CST)
const patchResult = patcher.injectNode(
  ast, 
  'Building["Lodge"].Floor[1]', 
  '#[structural] perimeter ext_wall { width: 60.ft, depth: 40.ft }'
);

// 3. Serialize back to a formatted string with byte-for-byte fidelity
const newSource = serialize(patchResult.cst);
console.log(newSource);
```

---

## 📐 The Domus DSL Overview

A valid `.domus` file integrates Geodetic Context, Universal Material Ontology (UMO) declarations, Assemblies, and Spatial Topology into a single source of truth.

```rust
domus "1.2.0"

// 1. COMPLIANCE & GEODETIC CONTEXT
context {
  project: "Alpine Retreat"
  profile: "US-CO-Denver-IRC2024" // Pinned immutable municipal code
  geodetic: geo(39.739, -104.990)
}

// 2. UNIVERSAL MATERIAL ONTOLOGY (UMO)
def mat SPF_No2 = umo::lignocellulosica.sawn.spf_grade_2 {
  @[mech.density: 26.2.pcf]
  @[mech.E: [1400000, 70000, 70000].psi]
  
  when moisture_content > 19.percent {
    @[mech.fc: [800, 200, 200].psi] // Mathematical structural decay
  }
}

// 3. SPATIAL TOPOLOGY
building "Main_Lodge" {
  floor 1 {
    // #[structural] forces downstream physics engines to trace load-paths
    #[structural] perimeter ext_wall { width: 60.ft, depth: 40.ft }
    
    zone "Great_Room" {
      bounds: [30.ft, 40.ft]
      anchor: perimeter.SouthWest
      
      // Generative MEP A* routing instructions
      hvac.supply(loc: [10.ft, 10.ft]) ~> perimeter.shaft ~> site.hvac_main
    }
  }
}
```

---

## ⚖️ Open Core vs. Commercial Ecosystem (Domus Studio)

`domus-core` is the **free, open-source foundation**. It provides the language, the parser, the UMO types, and the lossless text-to-AST pipeline. You are free to use it to build your own headless tools, renderers, or enterprise pipelines.

**Domus Studio** is the proprietary, commercial application built by the maintainers on top of this open core. It requires a paid license and provides:
* 🖥 **The Projectional IDE:** A dual-hemisphere Editor / WebGPU 3D Manifold.
* ⚛️ **The Heuristic Physics Engine:** Real-time continuous load path and wind-shear evaluation (Wasm).
* 🧠 **The M.O.R.E. Engine:** Multi-Objective Resolution Engine for automated structural failure patching.
* 🔐 **Cryptographic AoR Realization:** Zero-Trust AWS Nitro Enclave compliance proving and verifiable W3C credential sealing.

If you want the visual tools and the physics engine, you license Domus Studio. If you want the raw mathematical truth for free, use `domus-core`.

---

## 🛡 Contributing

`domus-core` is guarded by absolute Test-Driven Boundaries. Pull Requests must achieve a 100% pass rate in the test suite, including adversarial grammar fuzzing and byte-for-byte serialization isomorphism checks for both US (Imperial) and EU (Metric/Non-ASCII) contexts.

## License

`domus-core` is released under the **Apache License 2.0**.
```