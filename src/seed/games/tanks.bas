REM ===================================================
REM  TANKS.BAS - artillery duel at sunset
REM  Left/Right = aim   Up/Down = power   Space = fire
REM  First to 3 wins.   Q = quit
REM ===================================================
DIM SHARED h(319)
DIM SHARED tx(2), ty(2), th(2), pw(2), tc(2), score(2)
DIM SHARED trX(2, 400), trY(2, 400), trN(2)
DIM SHARED wind, cpu, aiErr
CONST G = 0.02
CONST HUDC = 9
CONST BOOM = 14
RANDOMIZE TIMER
tc(1) = 8: tc(2) = 15

DO
  IF NOT TitleScreen THEN EXIT DO
  score(1) = 0: score(2) = 0
  first = 1
  DO
    NewRound
    turn = first
    winner = 0
    DO
      IF turn = 2 AND cpu THEN
        CpuAim
      ELSE
        IF NOT Aim(turn) THEN winner = -1: EXIT DO
      END IF
      winner = Fire(turn)
      turn = 3 - turn
    LOOP UNTIL winner <> 0
    IF winner = -1 THEN EXIT DO
    score(winner) = score(winner) + 1
    Hud 0
    RoundOver winner
    first = 3 - first
  LOOP UNTIL score(1) = 3 OR score(2) = 3
  IF winner = -1 THEN EXIT DO
  IF NOT MatchOver THEN EXIT DO
LOOP
COLOR 9, 0
CLS
PRINT "Thanks for playing TANKS!"
END

' ---------------------------------------------------- title
FUNCTION TitleScreen
  COLOR 9, 0
  CLS
  DrawSky
  DrawSun
  FOR i = 0 TO 319
    LINE (i, 150 + SIN(i / 23) * 8 + SIN(i / 7) * 2)-(i, 199), 13
  NEXT i
  GPRINT 92, 34, "TANKS", 1, 5
  GPRINT 90, 32, "TANKS", 9, 5
  GPRINT 106, 70, "an artillery duel at sunset", 8
  COLOR 9, 13
  LOCATE 16, 15: PRINT "1  One player vs computer"
  LOCATE 17, 15: PRINT "2  Two players"
  LOCATE 18, 15: PRINT "Q  Quit"
  COLOR 10, 13
  LOCATE 20, 9: PRINT "Arrows aim and set power, Space fires";
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "1" OR k$ = "2" OR k$ = "Q" OR k$ = CHR$(27)
  cpu = (k$ = "1")
  TitleScreen = (k$ = "1" OR k$ = "2")
END FUNCTION

' ---------------------------------------------------- the world
SUB NewRound
  ' rolling hills from a few random sine waves
  a1 = RND * 6.3: a2 = RND * 6.3: a3 = RND * 6.3
  f1 = 0.012 + RND * 0.01: f2 = 0.03 + RND * 0.02
  base = 125 + RND * 25
  FOR i = 0 TO 319
    y = base + SIN(i * f1 + a1) * 28 + SIN(i * f2 + a2) * 12 + SIN(i * 0.09 + a3) * 2
    IF y < 70 THEN y = 70
    IF y > 188 THEN y = 188
    h(i) = INT(y)
  NEXT i
  ' a ridge in the middle so you can't just shoot flat
  peak = 60 + RND * 40
  FOR i = 110 TO 210
    bump = peak * (1 - ABS(i - 160) / 50)
    IF bump > 0 THEN h(i) = INT(MAX(55, h(i) - bump * 0.6))
  NEXT i
  tx(1) = 22 + INT(RND * 50)
  tx(2) = 298 - INT(RND * 50)
  FOR p = 1 TO 2
    Flatten p
    th(p) = 45 + (p = 2) * -90
    pw(p) = 50
    trN(p) = 0
  NEXT p
  wind = INT(RND * 11) - 5
  aiErr = 18
  DrawScene
END SUB

' level the ground under a tank and sit it on top
SUB Flatten (p)
  x = tx(p)
  lo = 0
  FOR i = x - 8 TO x + 8
    IF h(i) > lo THEN lo = h(i)
  NEXT i
  FOR i = x - 8 TO x + 8
    h(i) = lo
  NEXT i
  ty(p) = lo
END SUB

FUNCTION SkyCol (y)
  IF y < 30 THEN
    SkyCol = 1
  ELSEIF y < 54 THEN
    SkyCol = 2
  ELSEIF y < 74 THEN
    SkyCol = 3
  ELSEIF y < 90 THEN
    SkyCol = 4
  ELSEIF y < 106 THEN
    SkyCol = 5
  ELSEIF y < 124 THEN
    SkyCol = 6
  ELSE
    SkyCol = 7
  END IF
END FUNCTION

SUB DrawSky
  y0 = 0
  FOR y = 1 TO 199
    IF SkyCol(y) <> SkyCol(y0) THEN
      LINE (0, y0)-(319, y - 1), SkyCol(y0), BF
      y0 = y
    END IF
  NEXT y
  LINE (0, y0)-(319, 199), SkyCol(y0), BF
END SUB

' a big sun low on the horizon, cut by the sky bands
SUB DrawSun
  FOR y = 82 TO 150
    dy = y - 140
    IF dy < 0 THEN
      w = SQR(3600 - dy * dy)
      IF (y MOD 8) < 6 OR y < 104 THEN LINE (160 - w, y)-(160 + w, y), 8
    END IF
  NEXT y
END SUB

SUB DrawGround (x1, x2)
  IF x1 < 0 THEN x1 = 0
  IF x2 > 319 THEN x2 = 319
  FOR i = x1 TO x2
    LINE (i, h(i))-(i, 199), 13
    PSET (i, h(i)), 14
    IF h(i) + 12 < 199 THEN PSET (i, h(i) + 12 + (i MOD 3)), 12
  NEXT i
END SUB

SUB DrawScene
  DrawSky
  DrawSun
  DrawGround 0, 319
  FOR p = 1 TO 2
    DrawTank p
  NEXT p
  Hud 0
END SUB

' repaint sky + ground inside a box (used to erase the barrel)
SUB Repaint (x1, y1, x2, y2)
  IF x1 < 0 THEN x1 = 0
  IF x2 > 319 THEN x2 = 319
  IF y1 < 20 THEN y1 = 20
  FOR y = y1 TO y2
    LINE (x1, y)-(x2, y), SkyCol(y)
  NEXT y
  FOR i = x1 TO x2
    IF h(i) <= y2 THEN
      LINE (i, MAX(h(i), y1))-(i, y2), 13
      IF h(i) >= y1 THEN PSET (i, h(i)), 14
    END IF
  NEXT i
END SUB

SUB DrawTank (p)
  x = tx(p): y = ty(p): c = tc(p)
  a = th(p) * 3.14159 / 180
  LINE (x, y - 8)-(x + COS(a) * 10, y - 8 - SIN(a) * 10), c
  LINE (x, y - 7)-(x + COS(a) * 9, y - 7 - SIN(a) * 9), c
  LINE (x - 3, y - 10)-(x + 3, y - 6), c, BF
  LINE (x - 7, y - 6)-(x + 7, y - 3), c, BF
  LINE (x - 8, y - 3)-(x + 8, y - 1), 0, BF
  FOR k = -6 TO 6 STEP 4
    PSET (x + k, y - 2), 11
  NEXT k
  PSET (x - 2, y - 9), 9
END SUB

SUB Hud (turn)
  COLOR HUDC, 1
  LOCATE 1, 1: PRINT SPACE$(53);
  LOCATE 2, 1: PRINT SPACE$(53);
  LOCATE 1, 2
  IF cpu THEN PRINT "YOU"; ELSE PRINT "P1";
  PRINT score(1);
  LOCATE 1, 46: PRINT score(2);
  IF cpu THEN PRINT "CPU"; ELSE PRINT "P2";
  ' wind
  LOCATE 1, 22
  IF wind = 0 THEN
    PRINT " no wind ";
  ELSEIF wind < 0 THEN
    PRINT "WIND "; STRING$(-wind, "<");
  ELSE
    PRINT "WIND "; STRING$(wind, ">");
  END IF
  IF turn > 0 THEN
    e = th(turn)
    IF e > 90 THEN e = 180 - e
    COLOR tc(turn), 1
    IF turn = 1 THEN LOCATE 2, 2 ELSE LOCATE 2, 30
    PRINT "ANGLE"; e; " POWER"; pw(turn);
  END IF
END SUB

' ---------------------------------------------------- a turn
FUNCTION Aim (p)
  ShowTrail p
  Hud p
  Aim = -1
  DO
    k$ = INKEY$
    IF k$ = "" THEN
      SLEEP 0.03
    ELSE
      oth = th(p): opw = pw(p)
      IF LEN(k$) = 2 THEN
        SELECT CASE RIGHT$(k$, 1)
          CASE "K": th(p) = MIN(180, th(p) + 1)
          CASE "M": th(p) = MAX(0, th(p) - 1)
          CASE "H": pw(p) = MIN(100, pw(p) + 1)
          CASE "P": pw(p) = MAX(5, pw(p) - 1)
          CASE "I": pw(p) = MIN(100, pw(p) + 10)
          CASE "Q": pw(p) = MAX(5, pw(p) - 10)
        END SELECT
      ELSEIF k$ = " " OR k$ = CHR$(13) THEN
        EXIT FUNCTION
      ELSEIF UCASE$(k$) = "Q" OR k$ = CHR$(27) THEN
        Aim = 0
        EXIT FUNCTION
      END IF
      IF th(p) <> oth THEN
        Repaint tx(p) - 12, ty(p) - 20, tx(p) + 12, ty(p) - 6
        DrawTank p
      END IF
      IF th(p) <> oth OR pw(p) <> opw THEN Hud p
    END IF
  LOOP
END FUNCTION

' faint dots where this player's last shell flew
SUB ShowTrail (p)
  FOR i = 1 TO trN(p) STEP 3
    IF trY(p, i) > 20 THEN PSET (trX(p, i), trY(p, i)), 12
  NEXT i
END SUB

' Simulate a shot. Returns the x where it lands (or -1/-2 off the left/right edge).
FUNCTION Sim (p, ang, pow, record)
  a = ang * 3.14159 / 180
  x = tx(p) + COS(a) * 10: y = ty(p) - 8 - SIN(a) * 10
  vx = COS(a) * pow * 0.03: vy = -SIN(a) * pow * 0.03
  n = 0
  DO
    vx = vx + wind * 0.0004
    vy = vy + G
    x = x + vx: y = y + vy
    IF x < 0 THEN Sim = -1: EXIT FUNCTION
    IF x > 319 THEN Sim = -2: EXIT FUNCTION
    IF record AND n < 400 THEN
      n = n + 1
      trX(p, n) = x: trY(p, n) = y: trN(p) = n
    END IF
    IF y >= h(INT(x)) THEN Sim = x: EXIT FUNCTION
    FOR q = 1 TO 2
      IF ABS(x - tx(q)) <= 8 AND y >= ty(q) - 10 AND y <= ty(q) THEN Sim = x: EXIT FUNCTION
    NEXT q
  LOOP
END FUNCTION

' The computer tries every power, picks the best, then fumbles it a little
' (less each turn, so it closes in on you).
SUB CpuAim
  p = 2
  Hud p
  COLOR 9, 1: LOCATE 2, 30: PRINT "thinking...";
  target = tx(1)
  best = 999: bestP = 50
  ang = 180 - (35 + INT(RND * 35))
  FOR pow = 10 TO 100
    lx = Sim(p, ang, pow, 0)
    IF lx >= 0 THEN
      d = ABS(lx - target)
      IF d < best THEN best = d: bestP = pow
    END IF
  NEXT pow
  bestP = bestP + (RND * 2 - 1) * aiErr
  bestP = INT(MAX(10, MIN(100, bestP)))
  aiErr = aiErr * 0.55
  ' swing the barrel into place so you can see the aim
  pw(p) = bestP
  DO WHILE th(p) <> ang
    th(p) = th(p) + SGN(ang - th(p))
    Repaint tx(p) - 12, ty(p) - 20, tx(p) + 12, ty(p) - 6
    DrawTank p
    Hud p
    SLEEP 0.015
  LOOP
  SLEEP 0.4
END SUB

' Fire! Returns the winning player number, or 0 if nobody was hit.
FUNCTION Fire (p)
  trN(p) = 0
  lx = Sim(p, th(p), pw(p), 1)
  SOUND 140, 1
  ' fly the shell along the recorded path
  ox = -1
  FOR i = 1 TO trN(p)
    x = trX(p, i): y = trY(p, i)
    IF ox >= 0 AND oy > 20 THEN PSET (ox, oy), 9
    IF y > 20 THEN PSET (x, y), 7
    ox = x: oy = y
    IF i MOD 3 = 0 THEN SLEEP 0.008
  NEXT i
  IF lx < 0 THEN
    Message "Out of range!"
    DrawScene
    Fire = 0
    EXIT FUNCTION
  END IF
  Fire = Explode(x, y, p)
END FUNCTION

FUNCTION Explode (cx, cy, shooter)
  FOR r = 2 TO BOOM STEP 2
    CIRCLE (cx, cy), r, 7 - (r \ 5)
    CIRCLE (cx, cy), r - 1, 6
    PLAY "MB WN L64 O1 C"
    SLEEP 0.02
  NEXT r
  FOR r = BOOM TO 2 STEP -3
    CIRCLE (cx, cy), r, 4
  NEXT r
  ' dig the crater
  FOR i = INT(cx - BOOM) TO INT(cx + BOOM)
    IF i >= 0 AND i <= 319 THEN
      dx = i - cx
      dd = BOOM * BOOM - dx * dx
      IF dd < 0 THEN dd = 0
      dy = SQR(dd)
      IF h(i) < cy + dy THEN h(i) = INT(MIN(199, cy + dy))
    END IF
  NEXT i
  ' who got caught in the blast?
  hit = 0
  FOR q = 1 TO 2
    d = SQR((cx - tx(q)) ^ 2 + (cy - (ty(q) - 4)) ^ 2)
    IF d < BOOM + 3 THEN hit = hit + q
  NEXT q
  ' tanks slide down into the new ground
  FOR q = 1 TO 2
    lo = 0
    FOR i = tx(q) - 7 TO tx(q) + 7
      IF h(i) > lo THEN lo = h(i)
    NEXT i
    ty(q) = MIN(lo, 199)
  NEXT q
  DrawScene
  IF hit = 0 THEN Explode = 0: EXIT FUNCTION
  ' both hit = the shooter blew themselves up too; the other side wins
  IF hit = 3 OR hit = shooter THEN Explode = 3 - shooter ELSE Explode = shooter
  q = hit: IF hit = 3 THEN q = shooter
  FOR k = 1 TO 6
    LINE (tx(q) - 9, ty(q) - 12)-(tx(q) + 9, ty(q)), 5 + (k MOD 3), BF
    PLAY "MB WN L32 O1 C"
    SLEEP 0.06
  NEXT k
  Repaint tx(q) - 12, ty(q) - 20, tx(q) + 12, ty(q)
  ' a burnt-out wreck
  LINE (tx(q) - 8, ty(q) - 4)-(tx(q) + 8, ty(q) - 1), 0, BF
  LINE (tx(q) - 3, ty(q) - 6)-(tx(q) + 4, ty(q) - 4), 12, BF
END FUNCTION

SUB Message (m$)
  w = LEN(m$) * 6 + 16
  x = 160 - w \ 2
  LINE (x, 54)-(x + w, 74), 1, BF
  LINE (x, 54)-(x + w, 74), 9, B
  COLOR 9, 1
  LOCATE 7, (53 - LEN(m$)) \ 2 + 1
  PRINT m$;
  SLEEP 1
END SUB

SUB RoundOver (w)
  IF cpu AND w = 2 THEN
    m$ = "The computer wins this round."
  ELSEIF cpu THEN
    m$ = "Direct hit! You win the round."
  ELSE
    m$ = "Player" + STR$(w) + " wins the round!"
  END IF
  IF w = 1 OR NOT cpu THEN PLAY "T180 O4 L8 C E G > C" ELSE PLAY "T120 O3 L8 G E C < G"
  Message m$
  SLEEP 0.8
END SUB

FUNCTION MatchOver
  IF score(1) = 3 THEN w = 1 ELSE w = 2
  IF cpu AND w = 1 THEN
    m$ = "YOU WIN THE WAR!"
  ELSEIF cpu THEN
    m$ = "The computer wins the war."
  ELSE
    m$ = "PLAYER" + STR$(w) + " WINS THE WAR!"
  END IF
  LINE (60, 70)-(260, 130), 1, BF
  LINE (60, 70)-(260, 130), 7, B
  LINE (62, 72)-(258, 128), 6, B
  COLOR 7, 1
  LOCATE 9, (53 - LEN(m$)) \ 2 + 1: PRINT m$;
  COLOR 9, 1
  LOCATE 12, 18: PRINT "Play again? (Y/N)";
  IF w = 1 OR NOT cpu THEN PLAY "T160 O4 L8 G G G L4 > C L8 < G > C"
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "Y" OR k$ = "N" OR k$ = CHR$(27)
  MatchOver = (k$ = "Y")
END FUNCTION
