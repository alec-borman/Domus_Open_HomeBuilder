import { expect, test, describe } from 'vitest';
import { parse } from '../src/parser.js';
import { Lexer } from '../src/lexer.js';
import { serialize, injectNode } from '../src/patcher.js';

const fixtureA = `domus "1.2.0"

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
}`;

const fixtureB = `domus "1.2.0"

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
}`;

describe('Compiler: Parser & CST Fidelity', () => {
  test('1. Fixture A parses losslessly and serializes to identical string', () => {
    const { ast, diagnostics } = parse(fixtureA);
    expect(diagnostics).toHaveLength(0);
    const serialized = serialize(ast);
    expect(serialized).toBe(fixtureA);
  });

  test('2. Fixture B parses losslessly and serializes to identical string', () => {
    const { ast, diagnostics } = parse(fixtureB);
    expect(diagnostics).toHaveLength(0);
    const serialized = serialize(ast);
    expect(serialized).toBe(fixtureB);
  });
});

describe('Compiler: Error Recovery', () => {
  test('1. Syntax error is non-fatal and continues parsing', () => {
    const source = `domus "1.0"\nbuilding {\n  invalid_syntax! !!\n  floor 1 {}\n}`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics.length).toBeGreaterThan(0);
    const serialized = serialize(ast);
    expect(serialized).toBe(source);
  });
});

describe('Compiler: Patcher', () => {
  test('1. Inject node losslessly updates CST components', () => {
     const { ast, diagnostics } = parse(fixtureA);
     expect(diagnostics).toHaveLength(0);
     
     const injection = `\n    zone "NewZone" {}\n`;
     // In injectNode we look for path building floor
     // Let's modify the path format logic to easily hit the condition
     const res = injectNode(ast, 'building.Lodge.floor.1', injection);
     expect(res.diagnostics).toHaveLength(0);
     expect(res.cst).not.toBeNull();
     
     const newSource = serialize(res.cst!);
     expect(newSource).toContain('zone "NewZone"');
     // Validate it parses correctly
     const { diagnostics: newDiags } = parse(newSource);
     expect(newDiags).toHaveLength(0);
  });
});
