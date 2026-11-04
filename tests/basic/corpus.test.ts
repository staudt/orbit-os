import { describe, it, expect } from 'vitest';
import { runBasic } from '../../src/basic/headless';

/** Strip one leading newline so line 1 of the template is line 1 of the program. */
const prog = (src: string) => src.replace(/^\n/, '');

/** Run a program and assert it finishes without error and produces exactly `expected`. */
async function ok(src: string, expected: string, input?: string[]) {
  const r = await runBasic(prog(src), input ? { input } : undefined);
  expect(r.error).toBeUndefined();
  expect(r.output).toBe(expected);
}

const sp = (n: number) => ' '.repeat(n);

type Case = [name: string, src: string, expected: string];

describe('PRINT formatting', () => {
  const cases: Case[] = [
    ['positive integer', 'PRINT 5', ' 5 \n'],
    ['negative integer', 'PRINT -3', '-3 \n'],
    ['zero', 'PRINT 0', ' 0 \n'],
    ['one third', 'PRINT 1/3', ' .3333333 \n'],
    ['2.5', 'PRINT 2.5', ' 2.5 \n'],
    ['negative fraction', 'PRINT -0.5', '-.5 \n'],
    ['0.1+0.2 rounds to 7 digits', 'PRINT 0.1 + 0.2', ' .3 \n'],
    ['pi-ish rounded to 7 digits', 'PRINT 3.14159265', ' 3.141593 \n'],
    ['large integer', 'PRINT 123456789', ' 123456789 \n'],
    ['huge number uses E notation', 'PRINT 123456789 * 1000000000000', ' 1.234568E+20 \n'],
    ['string', 'PRINT "Hello"', 'Hello\n'],
    ['number after string via ;', 'PRINT "A"; 5', 'A 5 \n'],
    ['strings joined by ;', 'PRINT "Hello"; " "; "World"', 'Hello World\n'],
    ['two numbers with ;', 'PRINT 1; 2', ' 1  2 \n'],
    ['comma zones with strings', 'PRINT "A", "B"', 'A' + sp(13) + 'B\n'],
    ['three zones', 'PRINT "A", "B", "C"', 'A' + sp(13) + 'B' + sp(13) + 'C\n'],
    ['comma zone with numbers', 'PRINT 1, 2', ' 1 ' + sp(11) + ' 2 \n'],
    ['TAB forward', 'PRINT "A"; TAB(5); "B"', 'A   B\n'],
    ['TAB past current column wraps to next line', 'PRINT "ABCDEF"; TAB(3); "X"', 'ABCDEF\n  X\n'],
    ['SPC', 'PRINT "A"; SPC(3); "B"', 'A   B\n'],
    ['STR$ keeps leading space, no trailing', 'PRINT STR$(5); "|"; STR$(-5); "|"', ' 5|-5|\n'],
    ['STR$ length', 'PRINT LEN(STR$(123))', ' 4 \n'],
    ['STR$ fraction', 'PRINT STR$(1/4)', ' .25\n'],
  ];
  it.each(cases)('%s', async (_n, src, expected) => ok(src, expected));

  it('empty PRINT prints a blank line', () => ok(`
PRINT "a"
PRINT
PRINT "b"
`, 'a\n\nb\n'));

  it('trailing semicolon suppresses newline', () => ok(`
PRINT "A";
PRINT "B"
`, 'AB\n'));

  it('trailing comma suppresses newline and advances to next zone', () => ok(`
PRINT "A",
PRINT "B"
`, 'A' + sp(13) + 'B\n'));
});

describe('Arithmetic and precedence', () => {
  const cases: Case[] = [
    ['power', 'PRINT 2^3', ' 8 \n'],
    ['unary minus binds looser than ^', 'PRINT -2^2', '-4 \n'],
    ['mul before add', 'PRINT 2 + 3 * 4', ' 14 \n'],
    ['parentheses', 'PRINT (2 + 3) * 4', ' 20 \n'],
    ['division gives fractions', 'PRINT 7 / 2', ' 3.5 \n'],
    ['integer division', 'PRINT 7 \\ 2', ' 3 \n'],
    ['integer division truncates toward zero', 'PRINT -7 \\ 2', '-3 \n'],
    ['backslash is lower than *', 'PRINT 10 \\ 2 * 3', ' 1 \n'],
    ['MOD', 'PRINT 7 MOD 3', ' 1 \n'],
    ['MOD negative dividend', 'PRINT -7 MOD 3', '-1 \n'],
    ['MOD negative divisor', 'PRINT 7 MOD -3', ' 1 \n'],
    ['string concatenation', 'PRINT "ab" + "cd"', 'abcd\n'],
    ['comparisons give -1 and 0', 'PRINT 1 < 2; 2 < 1; 1 = 1; 1 <> 1', '-1  0 -1  0 \n'],
    ['string comparison', 'PRINT "abc" < "abd"', '-1 \n'],
    ['AND', 'PRINT 6 AND 3', ' 2 \n'],
    ['OR', 'PRINT 6 OR 3', ' 7 \n'],
    ['XOR', 'PRINT 6 XOR 3', ' 5 \n'],
    ['NOT 0', 'PRINT NOT 0', '-1 \n'],
    ['NOT 5', 'PRINT NOT 5', '-6 \n'],
    ['comparison binds tighter than AND', 'PRINT 1 < 2 AND 2 < 3', '-1 \n'],
  ];
  it.each(cases)('%s', async (_n, src, expected) => ok(src, expected));
});

describe('Variables', () => {
  it('% truncates toward zero', () => ok(`
x% = 2.7
y% = -2.7
PRINT x%; y%
`, ' 2 -2 \n'));

  it('& truncates and other suffixes accepted', () => ok(`
n& = 3.9
a! = 1.5
b# = 2
PRINT n&; a! + b#
`, ' 3  3.5 \n'));

  it('variables auto-initialise to 0 and ""', () => ok(`
PRINT n; "["; s$; "]"
`, ' 0 []\n'));

  it('LET is optional', () => ok(`
LET a = 5
b = a + 1
PRINT a; b
`, ' 5  6 \n'));

  it('CONST', () => ok(`
CONST K = 6
PRINT K * 2
`, ' 12 \n'));

  it('DIM AS STRING', () => ok(`
DIM s AS STRING
s = "hi"
PRINT s
`, 'hi\n'));

  it('keywords are case-insensitive', () => ok(`
print "hi"
PrInT 1
`, 'hi\n 1 \n'));
});

describe('Arrays', () => {
  it('1-D array with indices 0..N', () => ok(`
DIM a(3)
a(0) = 1
a(3) = 4
PRINT a(0) + a(3)
`, ' 5 \n'));

  it('2-D array', () => ok(`
DIM g(2, 3)
g(2, 3) = 7
PRINT g(2, 3); g(0, 0)
`, ' 7  0 \n'));

  it('string array', () => ok(`
DIM names$(2)
names$(1) = "x"
PRINT names$(1); "|"; names$(2); "|"
`, 'x||\n'));

  it('explicit bounds with LBOUND/UBOUND', () => ok(`
DIM a(1 TO 5)
a(1) = 10
a(5) = 50
PRINT LBOUND(a); UBOUND(a); a(1) + a(5)
`, ' 1  5  60 \n'));

  it('auto-DIM creates upper bound 10', () => ok(`
a(10) = 5
PRINT a(10); UBOUND(a)
`, ' 5  10 \n'));

  it('index below lower bound is an error', async () => {
    const r = await runBasic(prog(`
DIM a(1 TO 5)
PRINT "start"
a(0) = 1
`));
    expect(r.error).toBe('Subscript out of range in line 3');
    expect(r.output).toBe('start\n');
  });

  it('index above upper bound is an error', async () => {
    const r = await runBasic(prog(`
DIM a(3)
a(4) = 1
`));
    expect(r.error).toBe('Subscript out of range in line 2');
  });

  it('auto-DIM array overflow at 11 is an error', async () => {
    const r = await runBasic(prog(`
a(5) = 1
a(11) = 1
`));
    expect(r.error).toBe('Subscript out of range in line 2');
  });
});

describe('Control flow', () => {
  it('single-line IF/ELSE', () => ok(`
x = 7
IF x > 5 THEN PRINT "big" ELSE PRINT "small"
x = 3
IF x > 5 THEN PRINT "big" ELSE PRINT "small"
`, 'big\nsmall\n'));

  it('block IF / ELSEIF / ELSE', () => ok(`
FOR n = 1 TO 3
IF n = 1 THEN
PRINT "one"
ELSEIF n = 2 THEN
PRINT "two"
ELSE
PRINT "other"
END IF
NEXT
`, 'one\ntwo\nother\n'));

  it('FOR default step', () => ok(`
FOR i = 1 TO 3
PRINT i;
NEXT i
PRINT
`, ' 1  2  3 \n'));

  it('FOR positive STEP hitting the end value', () => ok(`
FOR i = 1 TO 10 STEP 3
PRINT i;
NEXT
PRINT
`, ' 1  4  7  10 \n'));

  it('FOR negative STEP', () => ok(`
FOR i = 3 TO 1 STEP -1
PRINT i;
NEXT
PRINT
`, ' 3  2  1 \n'));

  it('FOR with zero iterations leaves start value', () => ok(`
FOR i = 5 TO 1
PRINT "x"
NEXT
PRINT i
`, ' 5 \n'));

  it('FOR variable after normal completion', () => ok(`
FOR i = 1 TO 3
NEXT
PRINT i
`, ' 4 \n'));

  it('nested FOR loops', () => ok(`
FOR i = 1 TO 2
FOR j = 1 TO 2
PRINT i * 10 + j;
NEXT j
NEXT i
PRINT
`, ' 11  12  21  22 \n'));

  it('WHILE / WEND', () => ok(`
i = 0
WHILE i < 3
i = i + 1
WEND
PRINT i
`, ' 3 \n'));

  it('DO WHILE', () => ok(`
i = 0
DO WHILE i < 3
i = i + 1
LOOP
PRINT i
`, ' 3 \n'));

  it('DO WHILE with false condition never runs', () => ok(`
i = 10
DO WHILE i < 5
PRINT "no"
LOOP
PRINT i
`, ' 10 \n'));

  it('DO UNTIL', () => ok(`
i = 0
DO UNTIL i = 3
i = i + 1
LOOP
PRINT i
`, ' 3 \n'));

  it('LOOP WHILE runs body at least once', () => ok(`
i = 10
DO
i = i + 1
LOOP WHILE i < 5
PRINT i
`, ' 11 \n'));

  it('LOOP UNTIL', () => ok(`
i = 0
DO
i = i + 1
LOOP UNTIL i >= 4
PRINT i
`, ' 4 \n'));

  it('EXIT FOR', () => ok(`
FOR i = 1 TO 10
IF i = 4 THEN EXIT FOR
NEXT
PRINT i
`, ' 4 \n'));

  it('EXIT DO', () => ok(`
DO
n = n + 1
IF n = 5 THEN EXIT DO
LOOP
PRINT n
`, ' 5 \n'));

  it('SELECT CASE with list and range and ELSE', () => ok(`
FOR v = 1 TO 5
SELECT CASE v
CASE 1, 2
PRINT "a";
CASE 3 TO 4
PRINT "b";
CASE ELSE
PRINT "c";
END SELECT
NEXT
PRINT
`, 'aabbc\n'));

  it('SELECT CASE IS', () => ok(`
FOR v = 9 TO 12
SELECT CASE v
CASE IS > 10
PRINT "B";
CASE ELSE
PRINT "S";
END SELECT
NEXT
PRINT
`, 'SSBB\n'));

  it('SELECT CASE with strings', () => ok(`
s$ = "yes"
SELECT CASE s$
CASE "no"
PRINT 0
CASE "yes"
PRINT 1
CASE ELSE
PRINT 2
END SELECT
`, ' 1 \n'));

  it('GOTO a label', () => ok(`
GOTO skip
PRINT "no"
skip:
PRINT "yes"
`, 'yes\n'));

  it('GOSUB / RETURN with label', () => ok(`
GOSUB sub1
PRINT "back"
END
sub1:
PRINT "in"
RETURN
`, 'in\nback\n'));

  it('GOTO with line numbers', () => ok(`
10 GOTO 30
20 PRINT "skipped"
30 PRINT "done"
`, 'done\n'));

  it('GOSUB with line numbers', () => ok(`
10 GOSUB 100
20 PRINT "back"
30 END
100 PRINT "sub"
110 RETURN
`, 'sub\nback\n'));

  it('IF ... THEN <line number>', () => ok(`
10 x = 1
20 IF x = 1 THEN 40
30 PRINT "no"
40 PRINT "yes"
`, 'yes\n'));
});

describe('SUB and FUNCTION', () => {
  it('variables are passed by reference', () => ok(`
SUB Inc (n)
n = n + 1
END SUB
x = 5
Inc x
PRINT x
`, ' 6 \n'));

  it('array elements are passed by reference', () => ok(`
SUB Inc (n)
n = n + 1
END SUB
DIM a(3)
a(2) = 10
CALL Inc(a(2))
PRINT a(2)
`, ' 11 \n'));

  it('parentheses force by-value', () => ok(`
SUB Inc (n)
n = n + 1
END SUB
x = 5
CALL Inc((x))
PRINT x
`, ' 5 \n'));

  it('recursive factorial', () => ok(`
FUNCTION Fact (n)
IF n <= 1 THEN
Fact = 1
ELSE
Fact = n * Fact(n - 1)
END IF
END FUNCTION
PRINT Fact(5)
`, ' 120 \n'));

  it('recursive fibonacci', () => ok(`
FUNCTION Fib (n)
IF n < 2 THEN
Fib = n
ELSE
Fib = Fib(n - 1) + Fib(n - 2)
END IF
END FUNCTION
PRINT Fib(10)
`, ' 55 \n'));

  it('string FUNCTION', () => ok(`
FUNCTION Greet$ (n$)
Greet$ = "Hello, " + n$ + "!"
END FUNCTION
PRINT Greet$("Bob")
`, 'Hello, Bob!\n'));

  it('FUNCTION and SUB may be defined after use', () => ok(`
PRINT Sq(4)
Hello
FUNCTION Sq (n)
Sq = n * n
END FUNCTION
SUB Hello
PRINT "hi"
END SUB
`, ' 16 \nhi\n'));

  it('SUB bodies are not executed inline', () => ok(`
PRINT "a"
SUB Never
PRINT "never"
END SUB
PRINT "b"
`, 'a\nb\n'));

  it('DIM SHARED globals are visible in SUBs', () => ok(`
DIM SHARED total
SUB Add (n)
total = total + n
END SUB
Add 3
Add 4
PRINT total
`, ' 7 \n'));

  it('locals do not leak out of SUBs', () => ok(`
SUB Foo
secret = 99
END SUB
Foo
PRINT secret
`, ' 0 \n'));

  it('non-shared globals are not visible in SUBs', () => ok(`
x = 5
SUB Show
PRINT x
END SUB
Show
`, ' 0 \n'));

  it('EXIT SUB', () => ok(`
SUB T (n)
IF n > 1 THEN EXIT SUB
PRINT "small"
END SUB
T 5
T 0
`, 'small\n'));

  it('FUNCTION without assignment returns 0', () => ok(`
FUNCTION F (a)
END FUNCTION
PRINT F(1)
`, ' 0 \n'));
});

describe('Built-in functions', () => {
  const cases: Case[] = [
    ['LEN', 'PRINT LEN("hello")', ' 5 \n'],
    ['LEFT$', 'PRINT LEFT$("hello", 2)', 'he\n'],
    ['RIGHT$', 'PRINT RIGHT$("hello", 3)', 'llo\n'],
    ['MID$ with length', 'PRINT MID$("hello", 2, 3)', 'ell\n'],
    ['MID$ without length', 'PRINT MID$("hello", 3)', 'llo\n'],
    ['INSTR 2 args, 3 args, not found', 'PRINT INSTR("hello", "l"); INSTR(4, "hello", "l"); INSTR("hello", "z")', ' 3  4  0 \n'],
    ['UCASE$ / LCASE$', 'PRINT UCASE$("aBc"); LCASE$("aBc")', 'ABCabc\n'],
    ['LTRIM$ / RTRIM$', 'PRINT "["; LTRIM$("  a "); "]["; RTRIM$("  a "); "]"', '[a ][  a]\n'],
    ['SPACE$', 'PRINT "["; SPACE$(3); "]"', '[   ]\n'],
    ['STRING$ with char and code', 'PRINT STRING$(3, "x"); STRING$(2, 65)', 'xxxAA\n'],
    ['CHR$ / ASC', 'PRINT CHR$(65); ASC("A")', 'A 65 \n'],
    ['VAL leading number', 'PRINT VAL("12ab")', ' 12 \n'],
    ['VAL with space and sign', 'PRINT VAL(" -3.5")', '-3.5 \n'],
    ['VAL of non-number', 'PRINT VAL("abc")', ' 0 \n'],
    ['HEX$', 'PRINT HEX$(255)', 'FF\n'],
    ['ABS / SGN', 'PRINT ABS(-3); SGN(-5); SGN(0); SGN(9)', ' 3 -1  0  1 \n'],
    ['INT is floor', 'PRINT INT(2.5); INT(-2.5)', ' 2 -3 \n'],
    ['FIX truncates', 'PRINT FIX(2.5); FIX(-2.5)', ' 2 -2 \n'],
    ['CINT rounds half to even', 'PRINT CINT(2.5); CINT(3.5); CINT(2.6)', ' 2  4  3 \n'],
    ['SQR', 'PRINT SQR(16)', ' 4 \n'],
    ['MIN / MAX', 'PRINT MIN(3, 7); MAX(3, 7)', ' 3  7 \n'],
  ];
  it.each(cases)('%s', async (_n, src, expected) => ok(src, expected));

  it('MID$ statement replaces in place', () => ok(`
s$ = "hello"
MID$(s$, 1, 1) = "J"
PRINT s$
`, 'Jello\n'));

  it('RND stays in [0,1) after RANDOMIZE', () => ok(`
RANDOMIZE 42
FOR i = 1 TO 20
r = RND
IF r < 0 OR r >= 1 THEN PRINT "bad"
NEXT
PRINT "done"
`, 'done\n'));

  it('RANDOMIZE with the same seed is deterministic', async () => {
    const src = prog(`
RANDOMIZE 42
FOR i = 1 TO 5
PRINT RND
NEXT
`);
    const a = await runBasic(src);
    const b = await runBasic(src);
    expect(a.error).toBeUndefined();
    expect(a.output.split('\n').length).toBe(6);
    expect(b.output).toBe(a.output);
  });
});

describe('DATA / READ / RESTORE', () => {
  it('mixed strings and numbers', () => ok(`
DATA 1, 2, "three"
READ a, b, c$
PRINT a; b; c$
`, ' 1  2 three\n'));

  it('RESTORE starts over', () => ok(`
DATA 10, 20
READ x
RESTORE
READ y
PRINT x; y
`, ' 10  10 \n'));

  it('RESTORE label', () => ok(`
READ a
RESTORE second
READ b
PRINT a; b
DATA 1
second:
DATA 2
`, ' 1  2 \n'));

  it('Out of DATA error', async () => {
    const r = await runBasic(prog(`
DATA 1
READ a
READ b
`));
    expect(r.error).toBe('Out of DATA in line 3');
  });
});

describe('INPUT and LINE INPUT', () => {
  it('INPUT with ; prompt adds "? "', () => ok(`
INPUT "Name"; n$
PRINT "Hi "; n$
`, 'Name? Bob\nHi Bob\n', ['Bob']));

  it('INPUT with , prompt has no question mark', () => ok(`
INPUT "Name", n$
PRINT "Hi "; n$
`, 'NameBob\nHi Bob\n', ['Bob']));

  it('INPUT numeric', () => ok(`
INPUT "n"; n
PRINT n * 2
`, 'n? 5\n 10 \n', ['5']));

  it('INPUT a, b reads comma-separated values', () => ok(`
INPUT "v"; a, b
PRINT a + b
`, 'v? 3,4\n 7 \n', ['3,4']));

  it('LINE INPUT keeps commas', () => ok(`
LINE INPUT "Prompt: "; l$
PRINT l$
`, 'Prompt: a,b c\na,b c\n', ['a,b c']));

  it('successive inputs consume lines in order', () => ok(`
INPUT "a"; x
LINE INPUT "b: "; y$
PRINT x; y$
`, 'a? 1\nb: two words\n 1 two words\n', ['1', 'two words']));
});

describe('Errors', () => {
  it('Division by zero keeps earlier output', async () => {
    const r = await runBasic(prog(`
PRINT "before"
x = 0
PRINT 1 / x
`));
    expect(r.error).toBe('Division by zero in line 3');
    expect(r.output).toBe('before\n');
  });

  it('Type mismatch', async () => {
    const r = await runBasic(prog(`
PRINT "a"
x = "a" + 1
`));
    expect(r.error).toBe('Type mismatch in line 2');
    expect(r.output).toBe('a\n');
  });

  it('RETURN without GOSUB', async () => {
    const r = await runBasic(prog(`
PRINT "x"
RETURN
`));
    expect(r.error).toBe('RETURN without GOSUB in line 2');
    expect(r.output).toBe('x\n');
  });

  it('Label not defined', async () => {
    const r = await runBasic(prog(`
PRINT "a"
GOTO nowhere
`));
    expect(r.error).toBe('Label not defined in line 2');
  });

  it('Syntax error reports its line', async () => {
    const r = await runBasic(prog(`
PRINT "ok"
IF 1 = 1 PRINT "x"
`));
    expect(r.error).toMatch(/^Syntax error in line 2/);
  });

  it('error inside a SUB reports the physical line', async () => {
    const r = await runBasic(prog(`
SUB Boom
PRINT 1 / 0
END SUB
Boom
`));
    expect(r.error).toBe('Division by zero in line 2');
  });

  it('error line is the physical line with line numbers and colons', async () => {
    const r = await runBasic(prog(`
10 PRINT "a": PRINT "b"
20 REM nothing
30 PRINT 1 / 0
`));
    expect(r.error).toBe('Division by zero in line 3');
    expect(r.output).toBe('a\nb\n');
  });
});

describe('Statement separators and comments', () => {
  it('colon separates statements', () => ok(`
PRINT 1: PRINT 2
`, ' 1 \n 2 \n'));

  it('REM and apostrophe comments', () => ok(`
REM hello
PRINT "a" ' trailing
' full line
PRINT "b": REM after colon
`, 'a\nb\n'));

  it('apostrophe inside a string is not a comment', () => ok(`
PRINT "it's"
`, "it's\n"));
});

describe('Regressions', () => {
  it('CONST without a suffix can hold a string', async () => {
    const r = await runBasic('CONST K = "H"\nCONST N = 3\nPRINT K; N');
    expect(r).toEqual({ output: 'H 3 \n' });
  });
});
