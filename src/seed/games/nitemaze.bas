REM ===================================================
REM  NITEMAZE.BAS - something walks the maze after dark
REM  Find the lit gate before the Shade finds you.
REM  Up = step   Left/Right = turn   Down = turn around
REM  M = your map (only shows where you've been)
REM  Q = quit
REM ===================================================
DIM SHARED m(32, 32), dist(32, 32), vis(32, 32)
DIM SHARED qx(1100), qy(1100), sx(600), sy(600), cand(4)
DIM SHARED dx(3), dy(3), FW(8), FH(8), FC(8), SC(8)
DIM SHARED stX(40), stY(40), dirName$(3)
DIM SHARED MW, px, py, face, hx, hy, hpx, hpy, steps, level, seen
CONST CX = 160
CONST CY = 82
CONST VB = 164
CONST MAXD = 6
RANDOMIZE TIMER

dx(0) = 0: dy(0) = -1: dx(1) = 1: dy(1) = 0
dx(2) = 0: dy(2) = 1: dx(3) = -1: dy(3) = 0
dirName$(0) = "NORTH": dirName$(1) = "EAST"
dirName$(2) = "SOUTH": dirName$(3) = "WEST"
' perspective frames: frame k is the far edge of the k-th cell ahead
FOR k = 0 TO 8
  FW(k) = INT(80 / (k + 0.5) + 0.5)
  FH(k) = INT(FW(k) * 0.8 + 0.5)
NEXT k
FOR k = 0 TO 8: READ FC(k): NEXT k
FOR k = 0 TO 8: READ SC(k): NEXT k
DATA 14, 14, 12, 13, 13, 2, 2, 1, 1
DATA 12, 12, 13, 13, 2, 2, 1, 1, 1
FOR i = 1 TO 40
  stX(i) = INT(RND * 640): stY(i) = INT(RND * (CY - 6))
NEXT i

DO
  IF NOT Title THEN EXIT DO
  level = 1: totalSteps = 0
  DO
    result = PlayLevel
    totalSteps = totalSteps + steps
    IF result = 1 THEN Escaped: level = level + 1
  LOOP UNTIL result <> 1
  IF result = 3 THEN EXIT DO
  Caught
  IF NOT Again(totalSteps) THEN EXIT DO
LOOP
COLOR 9, 0
CLS
PRINT "Sleep well."
END

' ---------------------------------------------------- screens
FUNCTION Title
  COLOR 9, 0
  CLS
  FOR i = 1 TO 40
    PSET (stX(i) \ 2, stY(i) * 2), 12 + (i MOD 3 = 0) * -2
  NEXT i
  ' a gate of light at the end of a long corridor
  FOR k = 6 TO 1 STEP -1
    LINE (CX - FW(k) * 0.6, 150 - FH(k) * 1.2)-(CX + FW(k) * 0.6, 150), FC(k), BF
    LINE (CX - FW(k) * 0.6, 150 - FH(k) * 1.2)-(CX + FW(k) * 0.6, 150), 0, B
  NEXT k
  LINE (CX - 6, 136)-(CX + 6, 150), 7, BF
  LINE (CX - 3, 140)-(CX + 3, 150), 8, BF
  GPRINT 70, 18, "NIGHT MAZE", 2, 3
  GPRINT 69, 17, "NIGHT MAZE", 14, 3
  COLOR 12, 0
  LOCATE 7, 9: PRINT "Something walks the maze after dark."
  LOCATE 8, 9: PRINT "Find the lit gate before it finds you."
  COLOR 10, 0
  LOCATE 17, 4: PRINT "Up  step      Left/Right  turn     Down  turn"
  LOCATE 18, 4: PRINT "M   your map (only where you've been)"
  COLOR 7, 0
  LOCATE 20, 13: PRINT "SPACE to enter     Q to quit";
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = " " OR k$ = CHR$(13) OR k$ = "Q" OR k$ = CHR$(27)
  Title = (k$ = " " OR k$ = CHR$(13))
END FUNCTION

SUB Escaped
  FOR k = 6 TO 0 STEP -1
    LINE (CX - FW(k), MAX(0, CY - FH(k)))-(CX + FW(k), MIN(VB, CY + FH(k))), 7, BF
    LINE (CX - FW(k) \ 2, MAX(0, CY - FH(k) \ 2))-(CX + FW(k) \ 2, MIN(VB, CY + FH(k) \ 2)), 8, BF
    SLEEP 0.05
  NEXT k
  PLAY "T150 O4 L16 C E G > C E G L4 > C"
  COLOR 1, 7
  LOCATE 9, 12: PRINT " You slip out through the gate. ";
  LOCATE 11, 12: PRINT "  The night is not over yet...  ";
  SLEEP 2.5
END SUB

SUB Caught
  ' it lunges
  FOR s = 60 TO 220 STEP 40
    DrawView
    DrawShade s
    SOUND 70 - s \ 8, 1
  NEXT s
  LINE (0, 0)-(319, VB), 4, BF
  SOUND 40, 6
  FOR k = 1 TO 6
    FADE
    SLEEP 0.08
  NEXT k
  DrawMap 1
  COLOR 5, 0
  LOCATE 18, 1: PRINT SPACE$(53);
  LOCATE 18, 15: PRINT "The Shade has found you.";
  PLAY "T90 O2 L4 E D L2 C"
  SLEEP 1.5
END SUB

FUNCTION Again (total)
  COLOR 9, 0
  LOCATE 19, 1: PRINT SPACE$(53);
  LOCATE 19, 3
  PRINT "Mazes escaped:"; level - 1; "  Steps:"; total;
  COLOR 7, 0
  LOCATE 20, 1: PRINT SPACE$(53);
  LOCATE 20, 18: PRINT "Play again? (Y/N)";
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "Y" OR k$ = "N" OR k$ = CHR$(27)
  Again = (k$ = "Y")
END FUNCTION

' ---------------------------------------------------- the maze
SUB MakeMaze
  MW = MIN(31, 11 + level * 4)
  FOR y = 0 TO MW - 1
    FOR x = 0 TO MW - 1
      m(x, y) = 1: vis(x, y) = 0
    NEXT x
  NEXT y
  ' carve a perfect maze with a depth-first walk
  sp = 1: sx(1) = 1: sy(1) = 1: m(1, 1) = 0
  DO WHILE sp > 0
    ux = sx(sp): uy = sy(sp)
    n = 0
    FOR d = 0 TO 3
      nx = ux + dx(d) * 2: ny = uy + dy(d) * 2
      IF nx > 0 AND ny > 0 AND nx < MW - 1 AND ny < MW - 1 THEN
        IF m(nx, ny) = 1 THEN n = n + 1: cand(n) = d
      END IF
    NEXT d
    IF n = 0 THEN
      sp = sp - 1
    ELSE
      d = cand(1 + INT(RND * n))
      m(ux + dx(d), uy + dy(d)) = 0
      m(ux + dx(d) * 2, uy + dy(d) * 2) = 0
      sp = sp + 1
      sx(sp) = ux + dx(d) * 2: sy(sp) = uy + dy(d) * 2
    END IF
  LOOP
  ' knock out a few walls so there are loops to slip around it
  FOR k = 1 TO MW
    x = 1 + INT(RND * (MW - 2)): y = 1 + INT(RND * (MW - 2))
    IF m(x, y) = 1 THEN
      IF m(x - 1, y) = 0 AND m(x + 1, y) = 0 AND m(x, y - 1) = 1 AND m(x, y + 1) = 1 THEN m(x, y) = 0
      IF m(x, y - 1) = 0 AND m(x, y + 1) = 0 AND m(x - 1, y) = 1 AND m(x + 1, y) = 1 THEN m(x, y) = 0
    END IF
  NEXT k
  ' the gate, far corner
  m(MW - 1, MW - 2) = 2
  px = 1: py = 1: vis(1, 1) = 1
  IF m(2, 1) = 0 THEN face = 1 ELSE face = 2
  Bfs
  ' the Shade starts somewhere far from you
  far = 0
  FOR y = 1 TO MW - 2
    FOR x = 1 TO MW - 2
      IF dist(x, y) > far THEN far = dist(x, y)
    NEXT x
  NEXT y
  DO
    hx = 1 + INT(RND * (MW - 2)): hy = 1 + INT(RND * (MW - 2))
  LOOP UNTIL m(hx, hy) = 0 AND dist(hx, hy) >= far * 0.6
  hpx = hx: hpy = hy
END SUB

' distance from the player to every cell, along the passages
SUB Bfs
  FOR y = 0 TO MW - 1
    FOR x = 0 TO MW - 1
      dist(x, y) = -1
    NEXT x
  NEXT y
  dist(px, py) = 0
  qh = 1: qt = 1: qx(1) = px: qy(1) = py
  DO WHILE qh <= qt
    x = qx(qh): y = qy(qh): qh = qh + 1
    FOR d = 0 TO 3
      nx = x + dx(d): ny = y + dy(d)
      IF m(nx, ny) = 0 THEN
        IF dist(nx, ny) < 0 THEN
          dist(nx, ny) = dist(x, y) + 1
          qt = qt + 1: qx(qt) = nx: qy(qt) = ny
        END IF
      END IF
    NEXT d
  LOOP
END SUB

' The Shade wanders, but once it is near (or lucky) it follows your trail.
SUB MoveShade
  d0 = dist(hx, hy)
  n = 0
  IF d0 <= 8 OR RND < 0.4 THEN
    FOR d = 0 TO 3
      nx = hx + dx(d): ny = hy + dy(d)
      IF m(nx, ny) = 0 THEN
        IF dist(nx, ny) = d0 - 1 THEN n = n + 1: cand(n) = d
      END IF
    NEXT d
  END IF
  IF n = 0 THEN
    ' wander, preferring not to turn back
    FOR d = 0 TO 3
      nx = hx + dx(d): ny = hy + dy(d)
      IF m(nx, ny) = 0 AND (nx <> hpx OR ny <> hpy) THEN n = n + 1: cand(n) = d
    NEXT d
  END IF
  IF n = 0 THEN
    ' dead end: go back the way it came
    ox = hpx: oy = hpy
    hpx = hx: hpy = hy
    hx = ox: hy = oy
  ELSE
    hpx = hx: hpy = hy
    d = cand(1 + INT(RND * n))
    hx = hx + dx(d): hy = hy + dy(d)
  END IF
END SUB

' ---------------------------------------------------- one maze
' returns 1 = escaped, 2 = caught, 3 = quit
FUNCTION PlayLevel
  MakeMaze
  steps = 0
  mapMode = 0
  COLOR 9, 0
  CLS
  pace = 1.15 - level * 0.08
  IF pace < 0.45 THEN pace = 0.45
  nextMove = TIMER + 2.5
  redraw = 1
  DO
    k$ = INKEY$
    IF k$ <> "" THEN
      redraw = 1
      IF mapMode THEN
        mapMode = 0
      ELSEIF LEN(k$) = 2 THEN
        SELECT CASE RIGHT$(k$, 1)
          CASE "H"
            nx = px + dx(face): ny = py + dy(face)
            IF m(nx, ny) = 2 THEN PlayLevel = 1: EXIT FUNCTION
            IF m(nx, ny) = 0 THEN
              px = nx: py = ny: vis(px, py) = 1: steps = steps + 1
              PLAY "MB T255 O1 L64 WN V4 C"
              Bfs
            ELSE
              PLAY "MB T255 O1 L32 V8 C"
            END IF
          CASE "K": face = (face + 3) MOD 4
          CASE "M": face = (face + 1) MOD 4
          CASE "P": face = (face + 2) MOD 4
        END SELECT
      ELSEIF UCASE$(k$) = "M" THEN
        mapMode = 1
      ELSEIF UCASE$(k$) = "Q" OR k$ = CHR$(27) THEN
        PlayLevel = 3: EXIT FUNCTION
      END IF
      IF px = hx AND py = hy THEN PlayLevel = 2: EXIT FUNCTION
    END IF
    t = TIMER
    IF t < nextMove - 100 THEN nextMove = t
    IF t >= nextMove THEN
      MoveShade
      IF px = hx AND py = hy THEN PlayLevel = 2: EXIT FUNCTION
      d = dist(hx, hy)
      IF d <= 8 THEN
        nextMove = t + pace * 0.75
        PLAY "MB T255 O2 L32 WT V" + LTRIM$(STR$(15 - d)) + " C P32 C"
      ELSE
        nextMove = t + pace
      END IF
      redraw = 1
    END IF
    IF redraw THEN
      IF mapMode THEN DrawMap 0 ELSE DrawView
      Hud
      redraw = 0
    END IF
    SLEEP 0.02
  LOOP
END FUNCTION

' ---------------------------------------------------- drawing
SUB DrawView
  fx = dx(face): fy = dy(face)
  lf = (face + 3) MOD 4: rt = (face + 1) MOD 4
  ' how far can we see?
  n = MAXD + 1
  FOR i = 1 TO MAXD
    IF m(px + fx * i, py + fy * i) <> 0 THEN n = i: EXIT FOR
  NEXT i
  ' night sky and floor
  LINE (0, 0)-(319, CY - 1), 0, BF
  sh = face * 160
  FOR i = 1 TO 40
    x = (stX(i) + sh) MOD 640
    IF x < 320 THEN PSET (x, stY(i)), 12 + (i MOD 4 = 0) * -2
  NEXT i
  LINE (0, CY)-(319, VB), 1, BF
  FOR k = 0 TO n - 1
    IF CY + FH(k) <= VB THEN LINE (0, CY + FH(k))-(319, CY + FH(k)), 2
  NEXT k
  ' the far wall
  IF n <= MAXD THEN
    WallFace n - 1, m(px + fx * n, py + fy * n), CX - FW(n - 1), CX + FW(n - 1)
  END IF
  seen = 0
  ' walls on each side, far to near
  FOR i = MIN(n - 1, MAXD) TO 1 STEP -1
    ax = px + fx * i: ay = py + fy * i
    Side i, -1, m(ax + dx(lf), ay + dy(lf)), m(ax + dx(lf) + fx, ay + dy(lf) + fy)
    Side i, 1, m(ax + dx(rt), ay + dy(rt)), m(ax + dx(rt) + fx, ay + dy(rt) + fy)
    IF ax = hx AND ay = hy THEN DrawShade 80 / i: seen = i
  NEXT i
  LINE (0, VB + 1)-(319, 169), 0, BF
  LINE (0, VB + 1)-(319, VB + 2), 2, BF
END SUB

' a wall facing us at frame k, spanning x1..x2 (v = 2 is the gate)
SUB WallFace (k, v, x1, x2)
  y1 = MAX(0, CY - FH(k)): y2 = MIN(VB, CY + FH(k))
  a = MAX(0, x1): b = MIN(319, x2)
  IF v = 2 THEN
    LINE (a, y1)-(b, y2), 6, BF
    w = (x2 - x1) \ 4
    LINE (CX - w, y1 + (y2 - y1) \ 5)-(CX + w, y2), 7, BF
    LINE (CX - w \ 2, y1 + (y2 - y1) \ 3)-(CX + w \ 2, y2), 8, BF
  ELSE
    LINE (a, y1)-(b, y2), FC(k), BF
    IF k <= 2 THEN
      ' stone courses
      rh = (y2 - y1) / 5
      FOR r = 1 TO 4
        yy = y1 + r * rh
        LINE (a, yy)-(b, yy), SC(k)
        FOR xx = x1 + ((r MOD 2) + 1) * FW(k) \ 3 TO x2 STEP FW(k) * 2 \ 3
          IF xx > a AND xx < b THEN LINE (xx, yy - rh)-(xx, yy), SC(k)
        NEXT xx
      NEXT r
    END IF
  END IF
  LINE (x1, y1)-(x2, y2), 0, B
END SUB

' the side of cell i: s = -1 left, 1 right; v = that side's cell, b = the cell beyond it
SUB Side (i, s, v, beyond)
  a = i - 1
  xa = CX + s * FW(a): xb = CX + s * FW(i)
  IF v <> 0 THEN
    IF v = 2 THEN c = 7 ELSE c = SC(i)
    FOR x = MIN(xa, xb) TO MAX(xa, xb)
      IF x >= 0 AND x <= 319 THEN
        t = (x - xa) / (xb - xa)
        hh = FH(a) + (FH(i) - FH(a)) * t
        LINE (x, MAX(0, CY - hh))-(x, MIN(VB, CY + hh)), c
      END IF
    NEXT x
    LINE (xa, CY - FH(a))-(xb, CY - FH(i)), 0
    LINE (xa, CY + FH(a))-(xb, CY + FH(i)), 0
    LINE (xb, CY - FH(i))-(xb, CY + FH(i)), 0
  ELSEIF beyond <> 0 THEN
    ' an opening: we see the wall across the side passage
    IF s < 0 THEN WallFace i, beyond, CX - FW(i) * 3, xb ELSE WallFace i, beyond, xb, CX + FW(i) * 3
  END IF
END SUB

' the Shade, standing sz pixels "wide" in perspective
SUB DrawShade (sz)
  top = CY - sz * 0.5: bot = CY + sz * 0.8
  FOR y = MAX(0, top) TO MIN(VB, bot)
    t = (y - top) / (bot - top)
    w = sz * (0.1 + 0.32 * t)
    IF y > bot - sz * 0.08 AND (y MOD 2) = 0 THEN w = w * 0.8
    LINE (CX - w, y)-(CX + w, y), 0
    PSET (CX - w, y), 4: PSET (CX + w, y), 4
  NEXT y
  hy0 = top - sz * 0.1: r = sz * 0.16
  FOR y = -r TO r
    w = SQR(r * r - y * y)
    IF hy0 + y >= 0 THEN LINE (CX - w, hy0 + y)-(CX + w, hy0 + y), 0
  NEXT y
  e = MAX(1, sz * 0.025)
  LINE (CX - sz * 0.07 - e, hy0 - e)-(CX - sz * 0.07 + e, hy0 + e), 7, BF
  LINE (CX + sz * 0.07 - e, hy0 - e)-(CX + sz * 0.07 + e, hy0 + e), 7, BF
END SUB

' your scrap of map: only the cells you have walked (all = 1 shows everything)
SUB DrawMap (all)
  LINE (0, 0)-(319, VB), 0, BF
  cs = INT(150 / MW)
  ox = CX - (MW * cs) \ 2: oy = 8
  FOR y = 0 TO MW - 1
    FOR x = 0 TO MW - 1
      show = all OR vis(x, y)
      IF show = 0 THEN
        ' walls next to a visited cell are known too
        FOR d = 0 TO 3
          nx = x + dx(d): ny = y + dy(d)
          IF nx >= 0 AND ny >= 0 AND nx < MW AND ny < MW THEN
            IF vis(nx, ny) THEN show = -1
          END IF
        NEXT d
      END IF
      IF show THEN
        c = 1
        IF m(x, y) = 1 THEN c = 13
        IF m(x, y) = 2 THEN c = 7
        IF vis(x, y) AND m(x, y) = 0 THEN c = 2
        LINE (ox + x * cs, oy + y * cs)-(ox + x * cs + cs - 1, oy + y * cs + cs - 1), c, BF
      END IF
    NEXT x
  NEXT y
  ' you, with an arrow for your facing
  mx = ox + px * cs + cs \ 2: my = oy + py * cs + cs \ 2
  LINE (mx - 1, my - 1)-(mx + 1, my + 1), 9, BF
  LINE (mx, my)-(mx + dx(face) * cs \ 2, my + dy(face) * cs \ 2), 9
  IF all THEN
    LINE (ox + hx * cs, oy + hy * cs)-(ox + hx * cs + cs - 1, oy + hy * cs + cs - 1), 4, BF
  ELSE
    COLOR 12, 0
    LOCATE 17, 12: PRINT "(any key to put the map away)";
  END IF
END SUB

SUB Hud
  d = dist(hx, hy)
  IF seen THEN
    c = 5: m$ = "Two burning eyes in the dark. RUN!"
  ELSEIF d <= 2 THEN
    c = 5: m$ = "A cold breath on your neck. MOVE!"
  ELSEIF d <= 4 THEN
    c = 6: m$ = "It's close. You can hear it breathing."
  ELSEIF d <= 8 THEN
    c = 7: m$ = "Slow footsteps... it is hunting you."
  ELSEIF d <= 13 THEN
    c = 12: m$ = "A faint scraping, somewhere far off."
  ELSE
    c = 11: m$ = "The maze is quiet."
  END IF
  COLOR c, 0
  LOCATE 18, 1: PRINT SPACE$(53);
  LOCATE 18, (53 - LEN(m$)) \ 2 + 1: PRINT m$;
  COLOR 10, 0
  LOCATE 20, 1: PRINT SPACE$(53);
  LOCATE 20, 2: PRINT "MAZE"; level; "  FACING "; dirName$(face); "  STEPS"; steps;
  LOCATE 20, 45: PRINT "M = map";
END SUB
