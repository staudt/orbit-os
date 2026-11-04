import type { SeedFile } from '../fs/seed';

/* ---------- .WRT builder ---------- */

interface Run { t: string; b?: 1; i?: 1; u?: 1; s?: number }
type Para = { align?: 'center' | 'right'; runs: Run[] };

/** Compact run: plain string, or [text, flags] where flags may contain b, i, u, L (large). */
type R = string | [string, string];

function run(r: R): Run {
  if (typeof r === 'string') return { t: r };
  const [t, f] = r;
  const out: Run = { t };
  if (f.includes('b')) out.b = 1;
  if (f.includes('i')) out.i = 1;
  if (f.includes('u')) out.u = 1;
  if (f.includes('L')) out.s = 2;
  return out;
}

function para(runs: R[], align?: 'center' | 'right'): Para {
  const p: Para = { runs: runs.map(run) };
  if (align) p.align = align;
  return p;
}

function wrt(paras: Para[]): string {
  return JSON.stringify({ format: 'orbit-write', version: 1, paras });
}

const BLANK = (): Para => para([' ']);

const WELCOME = wrt([
  para([['Welcome to Orbit', 'bL']], 'center'),
  para([['A friendly little desktop that lives in your browser', 'i']], 'center'),
  BLANK(),
  para([['Files', 'b']]),
  para([
    'Drag and drop icons to move them around, and drop things on the ',
    ['Trash', 'u'],
    ' when you are done with them. You can import files from your real computer and export your work back out. For a full backup, open ',
    ['Config', 'i'],
    ' and save the whole disk.',
  ]),
  BLANK(),
  para([['Write', 'b']]),
  para([
    'Pick a style from the toolbar, or use ',
    ['Ctrl+B', 'b'], ', ', ['Ctrl+I', 'i'], ' and ', ['Ctrl+U', 'u'],
    ' for bold, italic and underline. Align text left, centered or right, and use ',
    ['Export as HTML', 'i'],
    ' to share a page with the rest of the world.',
  ]),
  BLANK(),
  para([['BASIC', 'b']]),
  para([
    'Open BASIC, type a program and press ',
    ['F5', 'b'],
    ' to run it. Programs live in the ',
    ['/Programs', 'u'],
    ' folder, and a .BAS file on the desktop runs when you double-click it. Try HELLO.BAS first, then peek at the code to see how it works.',
  ]),
  BLANK(),
  para([['Keyboard tips', 'b']]),
  para([['Ctrl+F4', 'b'], ' closes the current window.']),
  para([['Ctrl+`', 'b'], ' switches between open windows.']),
  para([['F10', 'b'], ' opens the menus, so you can drive everything without a mouse.']),
  BLANK(),
  para([['Have fun, and make something nice!', 'i']], 'center'),
]);

const SHOPPING = `SHOPPING LIST
-------------
[ ] Bread
[ ] Eggs
[ ] Coffee
[ ] Oranges
[ ] Floppy disks (just kidding)
`;

/* ---------- BASIC programs ---------- */

const HELLO = `REM ===================================================
REM  HELLO.BAS - a quick tour of Orbit BASIC
REM  Press F5 to run it. Lines starting with REM or '
REM  are comments: the computer ignores them.
REM ===================================================

CLS
COLOR 7                      ' yellow text
PRINT "Hello, world!"
COLOR 9                      ' back to cream
PRINT

' --- Variables -----------------------------------------
' Names ending in $ hold text; all others hold numbers.
INPUT "What is your name"; name$
age = 0
PRINT "Nice to meet you, "; name$; "!"
PRINT "Your name has"; LEN(name$); "letters."
PRINT

' --- A FOR loop ----------------------------------------
PRINT "Counting to 5:"
FOR i = 1 TO 5
  PRINT i;                   ' a trailing ; keeps us on one line
NEXT i
PRINT
PRINT

' --- IF / ELSE -----------------------------------------
n = LEN(name$)
IF n > 5 THEN
  PRINT "That is a nice long name."
ELSEIF n > 2 THEN
  PRINT "A good, solid name."
ELSE
  PRINT "Short and sweet!"
END IF
PRINT

' --- Calling a SUB and a FUNCTION ----------------------
Banner "Orbit"               ' a SUB does something
PRINT "7 squared is"; Square(7)    ' a FUNCTION gives back a value
PRINT "Shout: "; Shout$(name$)
PRINT
PRINT "That's it! Open the other programs to see more."
END

' A SUB groups statements under a name.
SUB Banner (text$)
  PRINT STRING$(LEN(text$) + 4, "*")
  PRINT "* "; text$; " *"
  PRINT STRING$(LEN(text$) + 4, "*")
END SUB

' A FUNCTION returns whatever you assign to its own name.
FUNCTION Square (x)
  Square = x * x
END FUNCTION

FUNCTION Shout$ (s$)
  Shout$ = UCASE$(s$) + "!!!"
END FUNCTION
`;

const GUESS = `REM ===================================================
REM  GUESS.BAS - guess the secret number from 1 to 100
REM ===================================================

RANDOMIZE TIMER               ' seed the dice with the clock
CLS
PRINT "=== GUESS THE NUMBER ==="
PRINT "I'm thinking of a number from 1 to 100."

DO                            ' outer loop: one pass per game
  secret = INT(RND * 100) + 1
  tries = 0
  PRINT

  DO                          ' inner loop: one pass per guess
    INPUT "Your guess"; guess
    tries = tries + 1
    diff = guess - secret

    SELECT CASE diff
      CASE 0
        PRINT "Got it in"; tries; "tries!"
      CASE IS < -30
        PRINT "Way too low."
      CASE -30 TO -1
        PRINT "Too low, but warm."
      CASE 1 TO 30
        PRINT "Too high, but warm."
      CASE ELSE
        PRINT "Way too high."
    END SELECT
  LOOP UNTIL diff = 0

  PRINT
  INPUT "Play again (y/n)"; again$
LOOP WHILE LCASE$(LEFT$(again$, 1)) = "y"

PRINT "Thanks for playing!"
`;

const SUNSET = `REM ===================================================
REM  SUNSET.BAS - a retro striped sunset
REM  Palette: 1 dark plum, 2 plum, 3 magenta, 4 crimson,
REM  5 red, 6 orange, 7 yellow, 9 cream, 13 purple
REM ===================================================

CONST HORIZON = 120

CLS

' --- Sky: horizontal bands from dark to warm ----------
DATA 1, 2, 13, 3, 4, 5
FOR band = 0 TO 5
  READ c
  LINE (0, band * 20)-(319, band * 20 + 19), c, BF
NEXT band

' --- Stars in the dark part of the sky ----------------
RANDOMIZE 42
FOR i = 1 TO 40
  PSET (INT(RND * 320), INT(RND * 55)), 9
NEXT i

' --- The sun: scanlines, with gaps that grow downward ---
cx = 160: cy = 100: r = 45
FOR y = cy - r TO HORIZON - 1
  dy = y - cy
  w = SQR(r * r - dy * dy)
  IF y > cy - 5 THEN
    gap = (y - cy + 5) MOD 8
    IF gap > 5 - (y - cy) \\ 6 THEN GOTO skip
  END IF
  IF y < cy - 20 THEN
    col = 7
  ELSEIF y < cy + 10 THEN
    col = 6
  ELSE
    col = 5
  END IF
  LINE (cx - w, y)-(cx + w, y), col
  skip:
NEXT y

' --- Mountains: one column at a time -------------------
FOR x = 0 TO 319
  h = 28 * ABS(SIN(x / 37)) + 14 * ABS(SIN(x / 13 + 1))
  LINE (x, HORIZON - h)-(x, HORIZON), 1
  PSET (x, HORIZON - h), 13        ' light the ridge
NEXT x

' --- Ground with a few perspective lines ---------------
LINE (0, HORIZON + 1)-(319, 199), 0, BF
FOR i = -8 TO 8
  LINE (160 + i * 8, HORIZON + 1)-(160 + i * 60, 199), 3
NEXT i
FOR k = 1 TO 5
  y = HORIZON + k * k * 3
  LINE (0, y)-(319, y), 3
NEXT k

COLOR 9
LOCATE 1, 2
PRINT "SUNSET";
LOCATE 20, 2
PRINT "Press any key";

DO: LOOP UNTIL INKEY$ <> ""
`;

const BOUNCE = `REM ===================================================
REM  BOUNCE.BAS - a ball bouncing around the screen
REM  Press any key to stop.
REM ===================================================

CONST R = 6                   ' ball radius

CLS
LINE (0, 0)-(319, 199), 11, B    ' the walls

x = 100: y = 60               ' position
dx = 3: dy = 2                ' speed in pixels per frame

DO
  ' erase the ball where it was
  LINE (x - R, y - R)-(x + R, y + R), 0, BF

  x = x + dx
  y = y + dy

  ' bounce off the walls (and beep!)
  IF x < R + 1 OR x > 318 - R THEN
    dx = -dx
    x = MAX(R + 1, MIN(318 - R, x))
    SOUND 440, 1
  END IF
  IF y < R + 1 OR y > 198 - R THEN
    dy = -dy
    y = MAX(R + 1, MIN(198 - R, y))
    SOUND 660, 1
  END IF

  ' draw the ball: an outline filled with orange
  CIRCLE (x, y), R, 7
  PAINT (x, y), 6, 7

  SLEEP 0.02                  ' about 50 frames a second
LOOP UNTIL INKEY$ <> ""

CLS
PRINT "Thanks for watching!"
`;

const TUNE = `REM ===================================================
REM  TUNE.BAS - a short cheerful tune with two voices
REM  T = tempo, O = octave, L = note length.
REM  A ; splits the string into voices that play together.
REM ===================================================

CLS
COLOR 7
PRINT "  *** LITTLE ORBIT WALTZ ***"
COLOR 9
PRINT
PRINT "Playing melody and bass..."

melody$ = "T140 O4 L8 MN E G >C< G E G >C2< "
melody$ = melody$ + "F A >D< A F A >D2< "
melody$ = melody$ + "G >C E< G >E D C< B A G F E D C4 P4"

bass$ = "O2 L4 MN C G C G F >C< F >C< G D G D C G C P"

PLAY melody$ + ";" + bass$

PRINT
PRINT "The end. Run it again with F5!"
`;

const DIARY = `REM ===================================================
REM  DIARY.BAS - add a note to DIARY.TXT and read it all
REM  Files are saved next to the program (or in /Documents).
REM ===================================================

CLS
PRINT "=== MY LITTLE DIARY ==="
PRINT
LINE INPUT "Write a note: "; note$

' APPEND adds to the end of the file (creating it if needed).
OPEN "DIARY.TXT" FOR APPEND AS #1
PRINT #1, DATE$; " "; TIME$; "  "; note$
CLOSE #1

PRINT
PRINT "Saved! Here is everything so far:"
PRINT STRING$(40, "-")

' Read the whole file back, one line at a time.
OPEN "DIARY.TXT" FOR INPUT AS #1
count = 0
DO WHILE NOT EOF(1)
  LINE INPUT #1, entry$
  PRINT entry$
  count = count + 1
LOOP
CLOSE #1

PRINT STRING$(40, "-")
PRINT count; "entries. Come back tomorrow!"
`;

const PRIMES = `REM ===================================================
REM  PRIMES.BAS - all the primes below 200
REM  A comma in PRINT jumps to the next 14-column zone.
REM ===================================================

CLS
start! = TIMER
count = 0

PRINT "Primes below 200:"
PRINT

FOR n = 2 TO 199
  IF IsPrime(n) THEN
    PRINT n,                  ' trailing comma: stay on this row
    count = count + 1
  END IF
NEXT n

PRINT
PRINT
PRINT "Found"; count; "primes in"; TIMER - start!; "seconds."
END

' A number is prime if no smaller number divides it evenly.
FUNCTION IsPrime (n)
  IsPrime = 0
  IF n < 2 THEN EXIT FUNCTION
  FOR d = 2 TO INT(SQR(n))
    IF n MOD d = 0 THEN EXIT FUNCTION
  NEXT d
  IsPrime = -1
END FUNCTION
`;

const lnk = (o: object) => JSON.stringify(o);

export const M2_SEEDS: SeedFile[] = [
  { path: '/Desktop/Write.LNK', content: lnk({ app: 'write' }), since: 2 },
  { path: '/Desktop/BASIC Editor.LNK', content: lnk({ app: 'basic' }), since: 2 },
  { path: '/Desktop/Programs.LNK', content: lnk({ path: '/Programs' }), since: 2 },
  { path: '/Documents/Welcome.WRT', content: WELCOME, since: 2 },
  { path: '/Documents/Shopping.TXT', content: SHOPPING, since: 2 },
  { path: '/Programs/HELLO.BAS', content: HELLO, since: 2 },
  { path: '/Programs/GUESS.BAS', content: GUESS, since: 2 },
  { path: '/Programs/SUNSET.BAS', content: SUNSET, since: 2 },
  { path: '/Programs/BOUNCE.BAS', content: BOUNCE, since: 2 },
  { path: '/Programs/TUNE.BAS', content: TUNE, since: 2 },
  { path: '/Programs/DIARY.BAS', content: DIARY, since: 2 },
  { path: '/Programs/PRIMES.BAS', content: PRIMES, since: 2 },
];
