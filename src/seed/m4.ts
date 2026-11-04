import type { SeedFile } from '../fs/seed';

/* ---------- BASIC window apps and games ---------- */

const CALC = `REM ===================================================
REM  CALC.BAS - a pocket calculator (window app)
REM ===================================================
DIM SHARED calcErr
WINDOW "Calculator", 150, 170
LABEL 1, "0", 8, 8, 134, 14

REM digits are ids 10-19, then . + - * / = C and backspace
dg$ = "789456123"
FOR i = 0 TO 8
  BUTTON 10 + VAL(MID$(dg$, i + 1, 1)), MID$(dg$, i + 1, 1), 8 + (i MOD 3) * 35, 30 + (i \\ 3) * 26, 32, 20
NEXT i
BUTTON 10, "0", 8, 108, 32, 20
BUTTON 20, ".", 43, 108, 32, 20
BUTTON 25, "=", 78, 108, 32, 20
BUTTON 24, "/", 113, 30, 32, 20
BUTTON 23, "*", 113, 56, 32, 20
BUTTON 22, "-", 113, 82, 32, 20
BUTTON 21, "+", 113, 108, 32, 20
BUTTON 26, "C", 8, 138, 66, 20
BUTTON 27, "<-", 78, 138, 66, 20

cur$ = "0"
acc = 0
op$ = ""
fresh = -1

DO
  e = WAITEVENT(0)
  IF e = -1 THEN EXIT DO
  IF calcErr AND e > 0 THEN
    REM any key after an error starts over
    calcErr = 0: cur$ = "0": acc = 0: op$ = "": fresh = -1
    IF e <> 26 THEN
      IF e >= 10 AND e <= 20 THEN e = e ELSE e = 0
    END IF
  END IF
  IF e >= 10 AND e <= 19 THEN
    IF fresh THEN cur$ = ""
    fresh = 0
    IF cur$ = "0" THEN cur$ = ""
    IF LEN(cur$) < 12 THEN cur$ = cur$ + LTRIM$(STR$(e - 10))
  ELSEIF e = 20 THEN
    IF fresh THEN cur$ = "0"
    fresh = 0
    IF INSTR(cur$, ".") = 0 AND LEN(cur$) < 12 THEN cur$ = cur$ + "."
  ELSEIF e >= 21 AND e <= 24 THEN
    IF op$ <> "" AND fresh = 0 THEN
      acc = Calc(acc, VAL(cur$), op$)
    ELSEIF op$ = "" THEN
      acc = VAL(cur$)
    END IF
    op$ = MID$("+-*/", e - 20, 1)
    fresh = -1
    IF calcErr THEN cur$ = "Error" ELSE cur$ = Fmt$(acc)
  ELSEIF e = 25 THEN
    IF op$ <> "" AND fresh = 0 THEN
      acc = Calc(acc, VAL(cur$), op$)
      IF calcErr THEN cur$ = "Error" ELSE cur$ = Fmt$(acc)
    END IF
    op$ = ""
    fresh = -1
  ELSEIF e = 26 THEN
    cur$ = "0": acc = 0: op$ = "": fresh = -1
  ELSEIF e = 27 THEN
    IF fresh = 0 THEN
      cur$ = LEFT$(cur$, LEN(cur$) - 1)
      IF cur$ = "" OR cur$ = "-" THEN cur$ = "0"
    END IF
  END IF
  IF e > 0 THEN SETTEXT 1, cur$
LOOP
END

FUNCTION Calc (a, b, o$)
  r = 0
  IF o$ = "+" THEN r = a + b
  IF o$ = "-" THEN r = a - b
  IF o$ = "*" THEN r = a * b
  IF o$ = "/" THEN
    IF b = 0 THEN calcErr = -1 ELSE r = a / b
  END IF
  Calc = r
END FUNCTION

FUNCTION Fmt$ (x)
  Fmt$ = LTRIM$(STR$(x))
END FUNCTION
`;

const CLOCK = `REM ===================================================
REM  CLOCK.BAS - an analog and digital clock (window app)
REM  The button switches between 24h and 12h.
REM ===================================================
PI = 3.14159265
cx = 100: cy = 88: rad = 78
WINDOW "Clock", 200, 240
LABEL 1, "", 10, 176, 180, 14
LABEL 2, "", 10, 192, 180, 14
BUTTON 3, "12h", 70, 214, 60, 16
mode24 = -1

DO
  GOSUB Redraw
  e = WAITEVENT(1000)
  IF e = 3 THEN
    mode24 = NOT mode24
    IF mode24 THEN SETTEXT 3, "12h" ELSE SETTEXT 3, "24h"
  END IF
LOOP UNTIL e = -1
END

Redraw:
  t$ = TIME$
  hh = VAL(LEFT$(t$, 2))
  mm = VAL(MID$(t$, 4, 2))
  ss = VAL(RIGHT$(t$, 2))
  REM clear and redraw the face
  LINE (0, 0)-(199, 172), 9, BF
  CIRCLE (cx, cy), rad, 0
  CIRCLE (cx, cy), rad + 1, 0
  FOR i = 0 TO 11
    a = i * PI / 6
    LINE (cx + (rad - 8) * SIN(a), cy - (rad - 8) * COS(a))-(cx + (rad - 2) * SIN(a), cy - (rad - 2) * COS(a)), 0
  NEXT i
  a = ((hh MOD 12) + mm / 60) * PI / 6
  LINE (cx, cy)-(cx + rad * 0.5 * SIN(a), cy - rad * 0.5 * COS(a)), 0
  LINE (cx + 1, cy)-(cx + 1 + rad * 0.5 * SIN(a), cy - rad * 0.5 * COS(a)), 0
  a = (mm + ss / 60) * PI / 30
  LINE (cx, cy)-(cx + rad * 0.78 * SIN(a), cy - rad * 0.78 * COS(a)), 2
  a = ss * PI / 30
  LINE (cx, cy)-(cx + rad * 0.88 * SIN(a), cy - rad * 0.88 * COS(a)), 5
  CIRCLE (cx, cy), 2, 0
  IF mode24 THEN
    SETTEXT 1, t$
  ELSE
    h12 = hh MOD 12
    IF h12 = 0 THEN h12 = 12
    IF hh >= 12 THEN sfx$ = " PM" ELSE sfx$ = " AM"
    SETTEXT 1, LTRIM$(STR$(h12)) + MID$(t$, 3) + sfx$
  END IF
  SETTEXT 2, DATE$
  RETURN
`;

const LANDER = `REM ===================================================
REM  LANDER.BAS - set the ship down gently on the green pad
REM  Up = thrust   Left/Right = sideways   Q = quit
REM ===================================================
DIM SHARED ter(320)
DIM SHARED padL, padR, padY
CONST UPK = "H"
CONST LEFTK = "K"
CONST RIGHTK = "M"
RANDOMIZE TIMER

DO
  GOSUB NewTerrain
  x = 160: y = 30: vx = RND * 1.0 - 0.5: vy = 0
  fuel = 300
  result = 0
  px = x: py = y
  DO
    k$ = INKEY$
    thrust = 0
    IF UCASE$(k$) = "Q" THEN result = 3
    IF LEN(k$) = 2 THEN
      c$ = RIGHT$(k$, 1)
      IF c$ = UPK AND fuel > 0 THEN vy = vy - 0.09: fuel = fuel - 1: thrust = -1
      IF c$ = LEFTK AND fuel > 0 THEN vx = vx - 0.04: fuel = fuel - 0.5
      IF c$ = RIGHTK AND fuel > 0 THEN vx = vx + 0.04: fuel = fuel - 0.5
    END IF
    vy = vy + 0.03
    x = x + vx
    y = y + vy
    IF x < 8 THEN x = 8: vx = 0
    IF x > 311 THEN x = 311: vx = 0
    IF y < 24 THEN y = 24: IF vy < 0 THEN vy = 0
    REM erase the old ship, then repair the terrain under it
    LINE (px - 9, py - 15)-(px + 9, py + 8), 0, BF
    Repair INT(px) - 9, INT(px) + 9
    REM landed or crashed?
    h = ter(INT(x))
    IF ter(INT(x) - 6) < h THEN h = ter(INT(x) - 6)
    IF ter(INT(x) + 6) < h THEN h = ter(INT(x) + 6)
    IF y >= h THEN
      y = h
      IF x - 6 >= padL AND x + 6 <= padR AND vy <= 0.8 AND ABS(vx) <= 0.5 THEN result = 1 ELSE result = 2
    END IF
    DrawShip x, y, thrust
    px = x: py = y
    REM readouts
    COLOR 9, 0
    LOCATE 1, 1
    PRINT "FUEL "; INT(fuel); "  ";
    LOCATE 1, 16
    PRINT "DOWN "; INT(vy * 10); " SIDE "; INT(vx * 10); "    ";
    LOCATE 2, 1
    IF vy <= 0.8 AND ABS(vx) <= 0.5 THEN PRINT "speed OK (land on the pad)    " ELSE PRINT "too fast to land safely    "
    IF result = 0 THEN SLEEP 0.03
  LOOP UNTIL result <> 0

  IF result = 1 THEN
    SOUND 523, 3: SOUND 659, 3: SOUND 784, 6
    LOCATE 11, 8: COLOR 15, 0
    PRINT "Touchdown! Smooth landing, pilot!"
  ELSEIF result = 2 THEN
    FOR r = 2 TO 26 STEP 3
      CIRCLE (x, y - 4), r, 7
      CIRCLE (x, y - 4), r \\ 2, 5
      SOUND 120 + RND * 100, 1
    NEXT r
    FOR i = 1 TO 40
      PSET (x + (RND - 0.5) * 60, y - 4 + (RND - 0.5) * 40), 6
    NEXT i
    SOUND 60, 8
    LOCATE 11, 10: COLOR 5, 0
    PRINT "Crash! The ship is in pieces."
  END IF
  IF result = 3 THEN EXIT DO
  COLOR 9, 0
  LOCATE 13, 12
  PRINT "Play again? (Y/N)"
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "Y" OR k$ = "N"
LOOP UNTIL k$ = "N"
CLS
COLOR 9, 0
PRINT "Safe travels!"
END

NewTerrain:
  CLS
  padL = 30 + INT(RND * 220)
  padR = padL + 44
  h = 140 + INT(RND * 30)
  FOR i = 0 TO 320
    IF i >= padL AND i <= padR THEN
      ter(i) = h
      padY = h
    ELSE
      h = h + INT(RND * 9) - 4
      IF h < 110 THEN h = 110
      IF h > 190 THEN h = 190
      ter(i) = h
    END IF
  NEXT i
  REM keep the ground level before and after the pad from jumping
  Repair 0, 319
  LINE (padL, padY)-(padR, padY + 2), 15, BF
  RETURN

SUB Repair (x1, x2)
  IF x1 < 0 THEN x1 = 0
  IF x2 > 319 THEN x2 = 319
  FOR i = x1 TO x2
    LINE (i, ter(i))-(i, 199), 10
  NEXT i
  IF x2 >= padL AND x1 <= padR THEN LINE (padL, padY)-(padR, padY + 2), 15, BF
END SUB

SUB DrawShip (x, y, flame)
  LINE (x - 4, y - 10)-(x + 4, y - 4), 9, B
  LINE (x - 2, y - 14)-(x + 2, y - 10), 14, B
  LINE (x - 4, y - 4)-(x - 6, y), 9
  LINE (x + 4, y - 4)-(x + 6, y), 9
  LINE (x - 7, y)-(x - 5, y), 9
  LINE (x + 5, y)-(x + 7, y), 9
  IF flame THEN
    LINE (x - 2, y - 4)-(x, y + 5), 7
    LINE (x + 2, y - 4)-(x, y + 5), 6
  END IF
END SUB
`;

const lnk = (o: object) => JSON.stringify(o);

export const M4_SEEDS: SeedFile[] = [
  { path: '/Programs/CALC.BAS', content: CALC, since: 3 },
  { path: '/Programs/CLOCK.BAS', content: CLOCK, since: 3 },
  { path: '/Programs/LANDER.BAS', content: LANDER, since: 3 },
  { path: '/Desktop/Calculator.LNK', content: lnk({ path: '/Programs/CALC.BAS' }), since: 3 },
];
