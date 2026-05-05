import { expect, test } from 'vitest';
import { Lexer } from '../src/lexer.js';

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

test('Lexer parses Fixture A cleanly without dropping trivia', () => {
  const lexer = new Lexer(fixtureA);
  const tokens = lexer.tokenize();
  const combined = tokens.filter(t => t.type !== 'EOF').map(t => t.value).join('');
  expect(combined).toBe(fixtureA);
  const invalidTokens = tokens.filter(t => t.type === 'Invalid');
  if (invalidTokens.length > 0) {
    console.error('Invalid tokens:', invalidTokens);
  }
  expect(invalidTokens).toHaveLength(0);
});

test('Lexer parses Fixture B cleanly (Unicode characters)', () => {
  const lexer = new Lexer(fixtureB);
  const tokens = lexer.tokenize();
  const combined = tokens.filter(t => t.type !== 'EOF').map(t => t.value).join('');
  expect(combined).toBe(fixtureB);
  expect(tokens.filter(t => t.type === 'Invalid')).toHaveLength(0);
});

test('Lexer parses numbers and units correctly', () => {
  const source = `450.kg_m3 24.5.MPa 1.2_W_m2K 30.ft`;
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize().filter(t => t.type === 'Number');
  expect(tokens).toHaveLength(4);
  expect(tokens[0].value).toBe('450.kg_m3');
  expect(tokens[1].value).toBe('24.5.MPa');
  expect(tokens[2].value).toBe('1.2_W_m2K');
  expect(tokens[3].value).toBe('30.ft');
});
