import { expect, test, describe } from 'vitest';
import { parse } from '../src/parser.js';
import { Lexer } from '../src/lexer.js';
import { serialize, injectNode, deleteNode, replaceNode } from '../src/patcher.js';

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
    expect(serialize(ast)).toBe(fixtureA);
  });
  test('2. Fixture B parses losslessly and serializes to identical string', () => {
    const { ast, diagnostics } = parse(fixtureB);
    expect(diagnostics).toHaveLength(0);
    expect(serialize(ast)).toBe(fixtureB);
  });
  test('3. Parses Context block', () => {
    const source = `domus "1.0"\ncontext { project: "Test" }`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(0);
    expect(ast.body[0].type).toBe('Context');
  });
  test('4. Parses Trait block', () => {
    const source = `domus "1.0"\ntrait ventilation { airflow: 10 }`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(0);
    expect(ast.body[0].type).toBe('Trait');
  });
  test('5. Parses Def mat block', () => {
    const source = `domus "1.0"\ndef mat x = umo::a.b.c { }`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(0);
    expect(ast.body[0].type).toBe('MaterialDefinition');
  });
  test('6. Parses Def assembly block', () => {
    const source = `domus "1.0"\ndef assembly x = { }`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(0);
    expect(ast.body[0].type).toBe('Def');
  });
  test('7. Parses Goal block', () => {
    const source = `domus "1.0"\ngoal my_goal { }`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(0);
    expect(ast.body[0].type).toBe('Goal');
  });
  test('8. Parses Building block', () => {
    const source = `domus "1.0"\nbuilding "b1" { }`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(0);
    expect(ast.body[0].type).toBe('Building');
  });
  test('9. Parses Import statement', () => {
    const source = `domus "1.0"\nimport "other.domus"`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(0);
    expect(ast.body[0].type).toBe('Import');
  });
  test('10. Parses Multiple Top Level blocks', () => {
    const source = `domus "1.0"\ncontext {}\ngoal g1 {}\nbuilding "b" {}`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(0);
    expect(ast.body.length).toBe(3);
  });
});

describe('Compiler: Error Recovery', () => {
  test('1. Syntax error is non-fatal and continues parsing', () => {
    const source = `domus "1.0"\nbuilding {\n  invalid_syntax! !!\n  floor 1 {}\n}`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(serialize(ast)).toBe(source);
  });
  test('2. Unclosed block recovers at next top level', () => {
    const source = `domus "1.0"\nbuilding "b1" { floor 1 { \ngoal my_goal {}`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(ast.body.length).toBe(1);
  });
  test('3. Missing version declaration triggers E001', () => {
    const source = `context { }`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics.some(d => d.code === 'E001')).toBe(true);
  });
  test('4. Duplicate declaration triggers E004', () => {
    const source = `domus "1.0"\ngoal a {}\ngoal a {}`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics.some(d => d.code === 'E004')).toBe(true);
  });
  test('5. Floating annotations trigger E012', () => {
    const source = `domus "1.0"\n#[floating]`;
    const { ast, diagnostics } = parse(source);
    expect(diagnostics.some(d => d.code === 'E012')).toBe(true);
  });
});

describe('Compiler: Patcher', () => {
  test('1. Inject node losslessly updates CST components', () => {
     const { ast, diagnostics } = parse(fixtureA);
     const injection = `\n    zone "NewZone" {}\n`;
     const res = injectNode(ast, 'Building["Lodge"].Floor[1]', injection);
     expect(res.diagnostics).toHaveLength(0);
     const newSource = serialize(res.cst!);
     expect(newSource).toContain('zone "NewZone"');
  });

  test('2. Delete node losslessly removes CST components', () => {
     const { ast, diagnostics } = parse(fixtureA);
     const res = deleteNode(ast, 'Building["Lodge"].Floor[1].Zone["Mech"]');
     expect(res.diagnostics).toHaveLength(0);
     const newSource = serialize(res.cst!);
     expect(newSource).not.toContain('zone "Mech"');
  });

  test('3. Replace node losslessly updates CST components', () => {
     const { ast, diagnostics } = parse(fixtureA);
     const replacement = `zone "ReplacedMech" { hvac.return() }`;
     const res = replaceNode(ast, 'Building["Lodge"].Floor[1].Zone["Mech"]', replacement);
     expect(res.diagnostics).toHaveLength(0);
     const newSource = serialize(res.cst!);
     expect(newSource).not.toContain('zone "Mech"');
     expect(newSource).toContain('zone "ReplacedMech"');
  });

  test('4. Invalid Bound: Patcher rejects injection of zone into context', () => {
     const { ast } = parse(fixtureA);
     const res = injectNode(ast, 'Context', '    zone "Invalid" {}');
     expect(res.diagnostics).toContainEqual(expect.objectContaining({ code: 'E015' }));
  });
  
  test('5. Invalid Bound: Patcher rejects injection of building into def', () => {
     const { ast } = parse(fixtureA);
     const res = injectNode(ast, 'Def["SPF_No2"]', '    building "Invalid" {}');
     expect(res.diagnostics).toContainEqual(expect.objectContaining({ code: 'E015' }));
  });

  test('6. Invalid Bound: Patcher rejects injection of floor into trait', () => {
     const { ast } = parse(`domus "1.0"\ntrait vent {}`);
     const res = injectNode(ast, 'Trait["vent"]', '    floor 1 {}');
     expect(res.diagnostics).toContainEqual(expect.objectContaining({ code: 'E015' }));
  });
  
  test('7. Invalid Bound: Patcher rejects replacement of non-existent path', () => {
     const { ast } = parse(fixtureA);
     const res = replaceNode(ast, 'Building["Fake"]', 'building "New" {}');
     expect(res.diagnostics).toContainEqual(expect.objectContaining({ code: 'E015' }));
  });
  
  test('8. Invalid Bound: Patcher rejects deleting non-existent path', () => {
     const { ast } = parse(fixtureA);
     const res = deleteNode(ast, 'Building["Lodge"].Floor[999]');
     expect(res.diagnostics).toContainEqual(expect.objectContaining({ code: 'E015' }));
  });
  
  test('9. Invalid Bound: Patcher rejects injection into building name format mistake', () => {
     const { ast } = parse(fixtureA);
     const res = injectNode(ast, 'Building[Lodge]', 'zone x {}');
     expect(res.diagnostics).toContainEqual(expect.objectContaining({ code: 'E015' }));
  });
});

describe('Compiler: DBU', () => {
  test('1. DBU correctly catches undeclared identifier references', () => {
     const source = `domus "1.0"\nbuilding "Test" {\n  floor 1 {\n    zone "TestZone" {\n      width: unknown_variable\n    }\n  }\n}`;
     const { diagnostics } = parse(source);
     expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'E003', message: 'Undeclared identifier reference: unknown_variable' }));
  });
});
