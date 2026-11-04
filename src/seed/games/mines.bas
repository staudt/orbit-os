REM ===================================================
REM  MINES.BAS - MINE FIELD
REM  Sweep the alien meadow at dusk for buried star mines.
REM  Left click = dig (or clear around a satisfied number)
REM  Right click = flag, then ?, then nothing
REM  Arrows move, Space digs, F flags, R restarts, Esc = menu
REM  Q = quit.  Your sun restarts the game when clicked.
REM ===================================================
DIM SHARED mine(25, 25), st(25, 25), nb(25, 25)
DIM SHARED qx(400), qy(400), best(3), numCol(8)
DIM SHARED gw, gh, cs, ox, oy, nMines, diff
DIM SHARED gstate, placed, revealed, flagsUsed, tstart, curC, curR
DIM SHARED hc, hr, hitC, hitR, lastLeft, lastTime, quitCode, newBest
CONST HUDH = 18
RANDOMIZE TIMER

FOR i = 1 TO 8: READ numCol(i): NEXT i
DATA 14, 15, 7, 6, 10, 8, 9, 11
LoadBest
diff = 1

DO
  diff = Title(diff)
  IF diff = 0 THEN EXIT DO
  PlayGame
LOOP UNTIL quitCode = 2
COLOR 9, 0
CLS
PRINT "The meadow is quiet again."
END

' ---------------------------------------------------- title screen
FUNCTION Title (sel)
  LOCATE 1, 1
  COLOR 9, 1
  CLS
  FOR i = 1 TO 50
    PSET (INT(RND * 320), INT(RND * 90)), 12 + (i MOD 3 = 0) * -2
  NEXT i
  ' a sun sinking into the meadow
  FillDisc 300, 150, 19, 5
  FillDisc 300, 150, 14, 6
  FillDisc 300, 150, 8, 7
  LINE (0, 150)-(319, 199), 13, BF
  LINE (0, 150)-(319, 150), 14
  FOR i = 0 TO 40
    x = INT(RND * 320): y = 155 + INT(RND * 44)
    PSET (x, y), 15
    PSET (x + 1, y - 1), 15
  NEXT i
  GPRINT 63, 7, "MINE FIELD", 0, 4
  GPRINT 61, 5, "MINE FIELD", 7, 4
  GPRINT 62, 40, "Star mines lie buried in the meadow.", 14
  GPRINT 62, 51, "Dig carefully. Numbers count the neighbours.", 12
  DrawButtons sel
  GPRINT 20, 165, "Click: dig   Right click: flag, ?, clear", 9
  GPRINT 20, 176, "Arrows + Space dig, F flag     Q quits", 9
  GPRINT 20, 187, "Click a number to clear around it", 9
  oldB = MOUSEB
  oldH = sel
  DO
    k$ = UCASE$(INKEY$)
    chosen = 0
    IF k$ = CHR$(0) + "H" THEN sel = sel - 1
    IF k$ = CHR$(0) + "P" THEN sel = sel + 1
    IF sel < 1 THEN sel = 3
    IF sel > 3 THEN sel = 1
    IF k$ = "1" THEN sel = 1: chosen = -1
    IF k$ = "2" THEN sel = 2: chosen = -1
    IF k$ = "3" THEN sel = 3: chosen = -1
    IF k$ = CHR$(13) OR k$ = " " THEN chosen = -1
    IF k$ = "Q" OR k$ = CHR$(27) THEN sel = 0: quitCode = 2: EXIT DO
    h = ButtonAt(MOUSEX, MOUSEY)
    IF h > 0 AND h <> oldHover THEN sel = h
    oldHover = h
    mb = MOUSEB
    IF mb = 1 AND oldB = 0 AND h > 0 THEN sel = h: chosen = -1
    oldB = mb
    IF sel <> oldH THEN
      DrawButtons sel
      oldH = sel
    END IF
    IF chosen THEN EXIT DO
    SLEEP 0.02
  LOOP
  Title = sel
END FUNCTION

' difficulty buttons at y = 66, 94, 122 (height 24)
SUB DrawButtons (sel)
  FOR i = 1 TO 3
    y = 38 + i * 28
    IF i = sel THEN bc = 7 ELSE bc = 13
    LINE (40, y)-(279, y + 23), 1, BF
    LINE (40, y)-(279, y + 23), bc, B
    IF i = sel THEN LINE (41, y + 1)-(278, y + 22), 2, B
    IF i = 1 THEN nm$ = "BEGINNER": dm$ = "9x9  10 mines"
    IF i = 2 THEN nm$ = "INTERMEDIATE": dm$ = "16x16  40 mines"
    IF i = 3 THEN nm$ = "WIDE": dm$ = "24x14  50 mines"
    IF i = sel THEN tc = 8 ELSE tc = 14
    GPRINT 48, y + 4, STR$(i) + "  " + nm$, tc, 1
    GPRINT 66, y + 14, dm$, 12
    IF best(i) > 0 THEN b$ = "best " + TRIM$(STR$(best(i))) + "s" ELSE b$ = "no record"
    GPRINT 200, y + 8, b$, 10
  NEXT i
END SUB

FUNCTION ButtonAt (mx, my)
  ButtonAt = 0
  FOR i = 1 TO 3
    y = 38 + i * 28
    IF mx >= 40 AND mx <= 279 AND my >= y AND my <= y + 23 THEN ButtonAt = i
  NEXT i
END FUNCTION

' ---------------------------------------------------- one session at a difficulty
SUB PlayGame
  quitCode = 0
  NewGame
  oldB = MOUSEB
  oldMX = -1: oldMY = -1
  DO
    k$ = UCASE$(INKEY$)
    IF k$ = "Q" THEN quitCode = 2: EXIT DO
    IF k$ = CHR$(27) THEN quitCode = 1: EXIT DO
    IF k$ = "R" THEN NewGame
    IF gstate = 0 THEN
      IF k$ = CHR$(0) + "H" THEN MoveCursor 0, -1
      IF k$ = CHR$(0) + "P" THEN MoveCursor 0, 1
      IF k$ = CHR$(0) + "K" THEN MoveCursor -1, 0
      IF k$ = CHR$(0) + "M" THEN MoveCursor 1, 0
      IF k$ = " " OR k$ = CHR$(13) THEN Dig curC, curR
      IF k$ = "F" THEN CycleFlag curC, curR
    END IF
    ' mouse: follow the pointer, act on press edges
    mx = MOUSEX: my = MOUSEY
    IF mx <> oldMX OR my <> oldMY THEN
      oldMX = mx: oldMY = my
      IF gstate = 0 AND CellAt(mx, my) THEN MoveCursor hc - curC, hr - curR
    END IF
    mb = MOUSEB
    IF mb <> 0 AND oldB = 0 THEN
      IF mx >= 150 AND mx <= 170 AND my < HUDH THEN
        NewGame
      ELSEIF gstate = 0 AND CellAt(mx, my) THEN
        MoveCursor hc - curC, hr - curR
        IF mb = 1 THEN Dig hc, hr
        IF mb = 2 THEN CycleFlag hc, hr
      END IF
    END IF
    oldB = mb
    UpdateCounters
    SLEEP 0.01
  LOOP
END SUB

' sets hc/hr (shared via DIM below) when the pixel is over the board
FUNCTION CellAt (mx, my)
  CellAt = 0
  IF mx >= ox AND my >= oy AND mx < ox + gw * cs AND my < oy + gh * cs THEN
    hc = (mx - ox) \ cs
    hr = (my - oy) \ cs
    CellAt = -1
  END IF
END FUNCTION

SUB MoveCursor (dc, dr)
  oc = curC: orr = curR
  curC = MAX(0, MIN(gw - 1, curC + dc))
  curR = MAX(0, MIN(gh - 1, curR + dr))
  IF oc <> curC OR orr <> curR THEN
    DrawCell oc, orr
    DrawCell curC, curR
  END IF
END SUB

SUB NewGame
  IF diff = 1 THEN gw = 9: gh = 9: nMines = 10: cs = 16
  IF diff = 2 THEN gw = 16: gh = 16: nMines = 40: cs = 11
  IF diff = 3 THEN gw = 24: gh = 14: nMines = 50: cs = 12
  FOR r = 0 TO 24
    FOR c = 0 TO 24
      mine(c, r) = 0: st(c, r) = 0: nb(c, r) = 0
    NEXT c
  NEXT r
  gstate = 0: placed = 0: revealed = 0: flagsUsed = 0
  tstart = 0: newBest = 0: hitC = -1: hitR = -1
  curC = gw \ 2: curR = gh \ 2
  ox = (320 - gw * cs) \ 2
  oy = HUDH + 2 + (200 - HUDH - 5 - gh * cs) \ 2
  COLOR 9, 1
  CLS
  FOR i = 1 TO 60
    sx = INT(RND * 320): sy = HUDH + 2 + INT(RND * (200 - HUDH - 2))
    IF sx < ox - 3 OR sx > ox + gw * cs + 3 OR sy < oy - 3 OR sy > oy + gh * cs + 3 THEN
      PSET (sx, sy), 2 + (i MOD 4 = 0) * -10
    END IF
  NEXT i
  LINE (ox - 3, oy - 3)-(ox + gw * cs + 2, oy + gh * cs + 2), 12, B
  LINE (ox - 2, oy - 2)-(ox + gw * cs + 1, oy + gh * cs + 1), 0, B
  FOR r = 0 TO gh - 1
    FOR c = 0 TO gw - 1
      DrawCell c, r
    NEXT c
  NEXT r
  DrawHud
END SUB

' mines go down after the first dig, never on or next to it
SUB PlaceMines (c0, r0)
  n = 0
  DO WHILE n < nMines
    c = INT(RND * gw): r = INT(RND * gh)
    IF mine(c, r) = 0 AND (ABS(c - c0) > 1 OR ABS(r - r0) > 1) THEN
      mine(c, r) = 1
      n = n + 1
    END IF
  LOOP
  FOR r = 0 TO gh - 1
    FOR c = 0 TO gw - 1
      n = 0
      FOR dr = -1 TO 1
        FOR dc = -1 TO 1
          nc = c + dc: nr = r + dr
          IF nc >= 0 AND nc < gw AND nr >= 0 AND nr < gh THEN n = n + mine(nc, nr)
        NEXT dc
      NEXT dr
      nb(c, r) = n
    NEXT c
  NEXT r
END SUB

' ---------------------------------------------------- game actions
SUB Dig (c, r)
  IF gstate <> 0 THEN EXIT SUB
  IF st(c, r) = 1 THEN
    Chord c, r
  ELSE
    RevealCell c, r
  END IF
END SUB

' clear the neighbours of a number whose flags match it
SUB Chord (c, r)
  IF nb(c, r) = 0 THEN EXIT SUB
  n = 0
  FOR dr = -1 TO 1
    FOR dc = -1 TO 1
      nc = c + dc: nr = r + dr
      IF nc >= 0 AND nc < gw AND nr >= 0 AND nr < gh THEN
        IF st(nc, nr) = 2 THEN n = n + 1
      END IF
    NEXT dc
  NEXT dr
  IF n <> nb(c, r) THEN EXIT SUB
  FOR dr = -1 TO 1
    FOR dc = -1 TO 1
      nc = c + dc: nr = r + dr
      IF nc >= 0 AND nc < gw AND nr >= 0 AND nr < gh AND gstate = 0 THEN
        RevealCell nc, nr
      END IF
    NEXT dc
  NEXT dr
END SUB

' reveal one cell; zeros spread outward using an explicit queue
SUB RevealCell (c0, r0)
  IF st(c0, r0) = 1 OR st(c0, r0) = 2 THEN EXIT SUB
  IF placed = 0 THEN
    PlaceMines c0, r0
    placed = -1
    tstart = TIMER
  END IF
  IF mine(c0, r0) <> 0 THEN
    hitC = c0: hitR = r0
    st(c0, r0) = 1
    LoseGame
    EXIT SUB
  END IF
  head = 0: tail = 0
  qx(0) = c0: qy(0) = r0: tail = 1
  st(c0, r0) = 1: revealed = revealed + 1
  WHILE head < tail
    c = qx(head): r = qy(head): head = head + 1
    DrawCell c, r
    IF nb(c, r) = 0 THEN
      FOR dr = -1 TO 1
        FOR dc = -1 TO 1
          nc = c + dc: nr = r + dr
          IF nc >= 0 AND nc < gw AND nr >= 0 AND nr < gh THEN
            IF st(nc, nr) = 0 OR st(nc, nr) = 3 THEN
              st(nc, nr) = 1: revealed = revealed + 1
              qx(tail) = nc: qy(tail) = nr: tail = tail + 1
            END IF
          END IF
        NEXT dc
      NEXT dr
    END IF
  WEND
  PLAY "MB T240 O5 L64 WS V8 C"
  IF revealed = gw * gh - nMines THEN WinGame
END SUB

' none -> flag -> question mark -> none
SUB CycleFlag (c, r)
  IF gstate <> 0 OR st(c, r) = 1 THEN EXIT SUB
  s = st(c, r)
  IF s = 2 THEN flagsUsed = flagsUsed - 1
  s = s + 1
  IF s = 4 THEN s = 0
  IF s = 1 THEN s = 2
  IF s = 2 THEN flagsUsed = flagsUsed + 1
  st(c, r) = s
  DrawCell c, r
  PLAY "MB T240 O4 L64 WT V9 G"
END SUB

SUB LoseGame
  gstate = 1
  FOR r = 0 TO gh - 1
    FOR c = 0 TO gw - 1
      IF mine(c, r) <> 0 OR st(c, r) = 2 THEN DrawCell c, r
    NEXT c
  NEXT r
  DrawCell hitC, hitR
  DrawSun 1
  DrawMessage "BOOM!", 4
  PLAY "MB T200 O2 L8 WN V15 C D E F P8 L4 WT V10 <A G"
END SUB

SUB WinGame
  gstate = 2
  FOR r = 0 TO gh - 1
    FOR c = 0 TO gw - 1
      IF mine(c, r) <> 0 AND st(c, r) <> 2 THEN
        st(c, r) = 2
        DrawCell c, r
      END IF
    NEXT c
  NEXT r
  flagsUsed = nMines
  UpdateCounters
  secs = ElapsedSecs
  IF best(diff) = 0 OR secs < best(diff) THEN
    best(diff) = secs
    newBest = -1
    SaveBest
  END IF
  DrawSun 2
  IF newBest THEN DrawMessage "NEW BEST!", 7 ELSE DrawMessage "CLEARED!", 15
  PLAY "MB T150 O4 L8 WS V10 C E G >C4 <G >C2"
END SUB

FUNCTION ElapsedSecs
  ElapsedSecs = 0
  IF placed <> 0 THEN
    t = TIMER - tstart
    IF t < 0 THEN t = t + 86400
    ElapsedSecs = MAX(1, MIN(999, INT(t)))
  END IF
END FUNCTION

' ---------------------------------------------------- HUD
SUB DrawHud
  LINE (0, 0)-(319, HUDH - 1), 1, BF
  LINE (0, HUDH - 1)-(319, HUDH - 1), 13
  DrawMine 8, 8, 7, 8
  GPRINT 232, 5, "TIME", 12
  lastLeft = -9999: lastTime = -9999
  IF gstate = 0 THEN DrawMessage "R = new game", 12
  DrawSun 0
  UpdateCounters
END SUB

' redraw the counters only when their value changed
SUB UpdateCounters
  mleft = nMines - flagsUsed
  IF mleft <> lastLeft THEN
    lastLeft = mleft
    LINE (18, 1)-(60, HUDH - 3), 1, BF
    GPRINT 19, 2, Pad$(mleft), 9, 2
  END IF
  t = ElapsedSecs
  IF gstate = 0 AND t <> lastTime THEN
    lastTime = t
    LINE (256, 1)-(310, HUDH - 3), 1, BF
    GPRINT 258, 2, Pad$(t), 9, 2
  END IF
END SUB

FUNCTION Pad$ (n)
  s$ = TRIM$(STR$(ABS(n)))
  DO WHILE LEN(s$) < 3
    s$ = "0" + s$
  LOOP
  IF n < 0 THEN s$ = "-" + RIGHT$(s$, 2)
  Pad$ = s$
END FUNCTION

SUB DrawMessage (m$, col)
  LINE (64, 1)-(145, HUDH - 3), 1, BF
  GPRINT 66, 5, m$, col
END SUB

' the sun: bright while playing, sinking when you lose, shades on a win
SUB DrawSun (mood)
  cx = 160: cy = 9
  LINE (146, 0)-(174, HUDH - 2), 1, BF
  IF mood = 1 THEN
    FillDisc cx, cy, 5, 4
    LINE (cx - 8, cy + 2)-(cx + 8, HUDH - 2), 1, BF
    LINE (cx - 9, cy + 1)-(cx + 9, cy + 1), 13
    EXIT SUB
  END IF
  IF mood = 2 THEN col = 8: ray = 7 ELSE col = 7: ray = 6
  FOR a = 0 TO 7
    dx = INT(COS(a * 0.7854) * 8 + 0.5 * SGN(COS(a * 0.7854)))
    dy = INT(SIN(a * 0.7854) * 8 + 0.5 * SGN(SIN(a * 0.7854)))
    LINE (cx + dx \ 2 * 1, cy + dy \ 2 * 1)-(cx + dx, cy + dy), ray
  NEXT a
  FillDisc cx, cy, 5, col
  IF mood = 2 THEN
    LINE (cx - 4, cy - 2)-(cx + 4, cy - 1), 0, BF
    LINE (cx, cy - 2)-(cx, cy - 2), col
  ELSE
    PSET (cx - 2, cy - 2), 0: PSET (cx + 2, cy - 2), 0
    PSET (cx - 2, cy - 1), 0: PSET (cx + 2, cy - 1), 0
  END IF
  PSET (cx - 3, cy + 1), 0: PSET (cx + 3, cy + 1), 0
  LINE (cx - 2, cy + 2)-(cx + 2, cy + 2), 0
END SUB

' ---------------------------------------------------- drawing
SUB FillDisc (cx, cy, rad, col)
  FOR y = -rad TO rad
    w = INT(SQR(rad * rad - y * y) + 0.5)
    LINE (cx - w, cy + y)-(cx + w, cy + y), col
  NEXT y
END SUB

' a four-pointed star mine centred on (x, y), arm length a
SUB DrawMine (x, y, col, a)
  b = a \ 2
  LINE (x - b, y)-(x + b, y), col
  LINE (x, y - b)-(x, y + b), col
  LINE (x - b + 1, y - b + 1)-(x + b - 1, y + b - 1), col
  LINE (x - b + 1, y + b - 1)-(x + b - 1, y - b + 1), col
  LINE (x - 1, y - 1)-(x + 1, y + 1), 8, BF
END SUB

SUB DrawFlag (x, y)
  LINE (x - 1, y - 4)-(x - 1, y + 3), 0
  LINE (x - 3, y + 3)-(x + 2, y + 3), 0
  FOR i = 0 TO 3
    LINE (x, y - 4 + i)-(x + 3 - i, y - 4 + i), 7
  NEXT i
END SUB

SUB DrawCell (c, r)
  x = ox + c * cs: y = oy + r * cs
  x2 = x + cs - 1: y2 = y + cs - 1
  mx = x + cs \ 2: my = y + cs \ 2
  s = st(c, r)
  isHidden = (s <> 1)
  wrongFlag = 0
  IF gstate = 1 THEN
    IF mine(c, r) <> 0 AND s <> 2 THEN isHidden = 0
    IF mine(c, r) = 0 AND s = 2 THEN wrongFlag = -1
  END IF
  IF isHidden THEN
    LINE (x, y)-(x2, y2), 13, BF
    LINE (x, y)-(x2, y), 14
    LINE (x, y)-(x, y2), 14
    LINE (x, y2)-(x2, y2), 0
    LINE (x2, y)-(x2, y2), 0
    IF s = 2 THEN DrawFlag mx, my
    IF s = 3 THEN GPRINT mx - 2, y + 1, "?", 8
    IF wrongFlag THEN
      LINE (x + 2, y + 2)-(x2 - 2, y2 - 2), 4
      LINE (x + 2, y2 - 2)-(x2 - 2, y + 2), 4
    END IF
  ELSE
    IF c = hitC AND r = hitR THEN bg = 4 ELSE bg = 2
    LINE (x, y)-(x2, y2), bg, BF
    LINE (x, y)-(x2, y2), 1, B
    IF mine(c, r) <> 0 THEN
      DrawMine mx, my, 7, cs - 3
    ELSEIF nb(c, r) > 0 THEN
      GPRINT mx - 2, y + 1, TRIM$(STR$(nb(c, r))), numCol(nb(c, r))
    END IF
  END IF
  IF c = curC AND r = curR AND gstate = 0 THEN LINE (x, y)-(x2, y2), 7, B
END SUB

' ---------------------------------------------------- best times
SUB LoadBest
  FOR i = 1 TO 3: best(i) = 0: NEXT i
  OPEN "/Documents/MINES.HI" FOR APPEND AS #1
  CLOSE #1
  OPEN "/Documents/MINES.HI" FOR INPUT AS #1
  FOR i = 1 TO 3
    IF NOT EOF(1) THEN INPUT #1, best(i)
  NEXT i
  CLOSE #1
END SUB

SUB SaveBest
  OPEN "/Documents/MINES.HI" FOR OUTPUT AS #1
  FOR i = 1 TO 3: PRINT #1, best(i): NEXT i
  CLOSE #1
END SUB
