import { expect, test, describe } from 'vitest';
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

describe('Lexer: CST Round-Trip Fidelity', () => {
  test('1. Fixture A round-trips losslessly', () => {
    const lexer = new Lexer(fixtureA);
    const tokens = lexer.tokenize();
    const combined = tokens.filter(t => t.type !== 'EOF').map(t => t.value).join('');
    expect(combined).toBe(fixtureA);
  });

  test('2. Fixture B round-trips losslessly', () => {
    const lexer = new Lexer(fixtureB);
    const tokens = lexer.tokenize();
    const combined = tokens.filter(t => t.type !== 'EOF').map(t => t.value).join('');
    expect(combined).toBe(fixtureB);
  });
});

describe('Lexer: Universal Units', () => {
  test('1. Parses simple metric unit', () => {
    const tokens = new Lexer("450.kg_m3").tokenize();
    expect(tokens[0].value).toBe("450.kg_m3");
    expect(tokens[0].type).toBe("Number");
  });

  test('2. Parses simple imperial unit', () => {
    const tokens = new Lexer("30.ft").tokenize();
    expect(tokens[0].value).toBe("30.ft");
  });

  test('3. Parses decimal leading unit', () => {
    const tokens = new Lexer("24.5.MPa").tokenize();
    expect(tokens[0].value).toBe("24.5.MPa");
  });

  test('4. Parses unit without whole number prefix (0 leading)', () => {
    const tokens = new Lexer("0.5.in").tokenize();
    expect(tokens[0].value).toBe("0.5.in");
  });

  test('5. Parses underscore delimiter', () => {
    const tokens = new Lexer("0.6_ACH50").tokenize();
    expect(tokens[0].value).toBe("0.6_ACH50");
  });

  test('6. Negative number interaction', () => {
    const tokens = new Lexer("-30.ft").tokenize();
    expect(tokens[0].type).toBe("Punctuation");
    expect(tokens[0].value).toBe("-");
    expect(tokens[1].type).toBe("Number");
    expect(tokens[1].value).toBe("30.ft");
  });

  test('7. Number without unit', () => {
    const tokens = new Lexer("30").tokenize();
    expect(tokens[0].type).toBe("Number");
    expect(tokens[0].value).toBe("30");
  });

  test('8. Number with trailing dot but no unit', () => {
    const tokens = new Lexer("30.").tokenize();
    expect(tokens[0].type).toBe("Number");
    expect(tokens[0].value).toBe("30");
    expect(tokens[1].type).toBe("Punctuation");
    expect(tokens[1].value).toBe(".");
  });

  test('9. Number immediately followed by punctuation', () => {
    const tokens = new Lexer("30.ft,").tokenize();
    expect(tokens[0].value).toBe("30.ft");
    expect(tokens[1].value).toBe(",");
  });

  test('10. Multiple units in string', () => {
    const tokens = new Lexer("1.m 2.cm 3.mm").tokenize().filter(t => t.type === 'Number');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].value).toBe("1.m");
    expect(tokens[1].value).toBe("2.cm");
    expect(tokens[2].value).toBe("3.mm");
  });
});

describe('Lexer: Multilingual Source', () => {
  test('1. German umlauts as identifiers', () => {
    const tokens = new Lexer("München Gebäude").tokenize().filter(t => t.type === 'Identifier');
    expect(tokens[0].value).toBe("München");
    expect(tokens[1].value).toBe("Gebäude");
  });

  test('2. Japanese Kanji/Hiragana as identifiers', () => {
    const tokens = new Lexer("建物 長さ").tokenize().filter(t => t.type === 'Identifier');
    expect(tokens[0].value).toBe("建物");
    expect(tokens[1].value).toBe("長さ");
  });

  test('3. Arabic script as identifiers', () => {
    const tokens = new Lexer("مبنى").tokenize();
    expect(tokens[0].value).toBe("مبنى");
    expect(tokens[0].type).toBe("Identifier");
  });

  test('4. Emoji as identifiers (multi-byte preservation)', () => {
    const tokens = new Lexer("🏠").tokenize();
    expect(tokens[0].type).toBe("Identifier");
    expect(tokens[0].value).toBe("🏠");
  });

  test('5. Mixed Unicode and punctuation offsets', () => {
    const tokens = new Lexer("長さ:=10.m").tokenize().filter(t => t.type !== 'EOF');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].value).toBe("長さ");
    expect(tokens[1].value).toBe(":=");
    expect(tokens[2].value).toBe("10.m");
  });
});

describe('Lexer: Trivia & CRLF', () => {
  test('1. CRLF sequences are preserved as single Whitespace', () => {
    const tokens = new Lexer("\r\n").tokenize();
    expect(tokens[0].type).toBe("Whitespace");
    expect(tokens[0].value).toBe("\r\n");
  });

  test('2. Tabs are recognized as whitespace', () => {
    const tokens = new Lexer("\t").tokenize();
    expect(tokens[0].type).toBe("Whitespace");
    expect(tokens[0].value).toBe("\t");
  });

  test('3. Mixed spaces and newlines parse accurately', () => {
    const tokens = new Lexer(" \t\r\n ").tokenize();
    expect(tokens[0].type).toBe("Whitespace");
    expect(tokens[0].value).toBe(" \t\r\n ");
  });

  test('4. Token start and end offsets track perfectly over CRLF', () => {
    const lexer = new Lexer("a\r\nb");
    const tokens = lexer.tokenize();
    expect(tokens[0].value).toBe("a");
    expect(tokens[0].start).toBe(0);
    expect(tokens[0].end).toBe(1);

    expect(tokens[1].type).toBe("Whitespace");
    expect(tokens[1].value).toBe("\r\n");
    expect(tokens[1].start).toBe(1);
    expect(tokens[1].end).toBe(3);

    expect(tokens[2].value).toBe("b");
    expect(tokens[2].start).toBe(3);
    expect(tokens[2].end).toBe(4);
  });

  test('5. Comments preserve trailing text but do not consume newlines', () => {
    const tokens = new Lexer("// test\r\nnext").tokenize();
    expect(tokens[0].type).toBe("Comment");
    expect(tokens[0].value).toBe("// test");
    expect(tokens[1].type).toBe("Whitespace");
    expect(tokens[1].value).toBe("\r\n");
    expect(tokens[2].type).toBe("Identifier");
    expect(tokens[2].value).toBe("next");
  });
});

describe('Lexer: Invalid Characters', () => {
  test('1. Unrecognized characters emit Invalid tokens', () => {
    const tokens = new Lexer("hello $ world").tokenize();
    expect(tokens[2].type).toBe("Invalid");
    expect(tokens[2].value).toBe("$");
    expect(tokens[4].type).toBe("Identifier"); // Recovers gracefully
  });

  test('2. Invalid characters do not halt parsing (Non-fatal recovery)', () => {
    const tokens = new Lexer("^ %").tokenize();
    expect(tokens[0].type).toBe("Invalid");
    expect(tokens[0].value).toBe("^");
    expect(tokens[2].type).toBe("Invalid");
    expect(tokens[2].value).toBe("%");
  });
});
