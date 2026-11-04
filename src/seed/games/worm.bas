REM ===================================================
REM  WORM.BAS - eat the numbers, mind the bricks
REM  P1: arrow keys     P2: W A S D  (in 1 player, both work)
REM  Eat food 1 to 9 to clear a level. You get 3 lives.
REM  P = pause   Q or Esc = quit
REM ===================================================
DIM SHARED occ(39, 22)
DIM SHARED bxr(2, 511), byr(2, 511), hd(2), tl(2), grow(2)
DIM SHARED dr(2), qd(2, 2), qn(2), nx(2), ny(2), crash(2)
DIM SHARED lives(2), score(2), dxs(3), dys(3), lname$(8)
DIM SHARED np, level, foodn, foodx, foody, hiscore, gQuit, gPause
CONST GW = 40
CONST GH = 23
CONST TOP = 16
CONST LASTFOOD = 9
CONST HIFILE = "/Documents/WORM.HI"
RANDOMIZE TIMER

dxs(0) = 0: dys(0) = -1: dxs(1) = 1: dys(1) = 0
dxs(2) = 0: dys(2) = 1: dxs(3) = -1: dys(3) = 0
FOR i = 1 TO 8: READ lname$(i): NEXT i
DATA "THE MEADOW", "THE PILLARS", "THE CORRIDORS", "THE CROSSROADS"
DATA "THE GATEHOUSE", "THE COMB", "THE ZIGZAG", "THE FORTRESS"
LoadHi

DO
  np = Title
  IF np = 0 THEN EXIT DO
  PlayGame
  IF NOT GameOver THEN EXIT DO
LOOP
COLOR 9, 0
CLS
PRINT "The worms crawl home. Bye!"
END

' ---------------------------------------------------- screens
FUNCTION Title
  COLOR 9, 0
  CLS
  GPRINT 82, 11, "WORM", 2, 8
  GPRINT 80, 9, "WORM", 7, 8
  COLOR 12, 0
  LOCATE 8, 9: PRINT "Eat the numbers. Mind the bricks.";
  LOCATE 9, 9: PRINT "Do not bite yourself.";
  COLOR 10, 0
  LOCATE 15, 9: PRINT "P1  arrow keys        P2  W A S D";
  LOCATE 16, 9: PRINT "P  pause      Q / Esc  quit";
  COLOR 7, 0
  LOCATE 18, 12: PRINT "1  One player";
  LOCATE 19, 12: PRINT "2  Two players";
  COLOR 12, 0
  IF hiscore > 0 THEN LOCATE 20, 12: PRINT "Best: "; hiscore;
  ' a little worm swimming along a wavy track (a ring of segments)
  DIM ax(13), ay(13)
  n = 13: t = 0: head = 0
  FOR i = 0 TO n - 1: ax(i) = -20: ay(i) = 0: NEXT i
  DO
    t = t + 0.14
    x = 160 + 130 * SIN(t * 0.45)
    y = 114 + 12 * SIN(t * 1.7)
    ' old head becomes body
    LINE (ax(head), ay(head))-(ax(head) + 6, ay(head) + 6), 7, BF
    head = (head + 1) MOD n
    ' the slot after the head holds the tail: erase it
    LINE (ax(head), ay(head))-(ax(head) + 6, ay(head) + 6), 0, BF
    ax(head) = INT(x): ay(head) = INT(y)
    LINE (ax(head), ay(head))-(ax(head) + 6, ay(head) + 6), 6, BF
    PSET (ax(head) + 4, ay(head) + 2), 0
    PSET (ax(head) + 4, ay(head) + 4), 0
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "1" OR k$ = "2" OR k$ = "Q" OR k$ = CHR$(27)
  IF k$ = "1" THEN Title = 1
  IF k$ = "2" THEN Title = 2
  IF k$ = "Q" OR k$ = CHR$(27) THEN Title = 0
END FUNCTION

SUB Card (txt$, note$, c, ext)
  ' a banner across the middle of the screen
  LINE (30, 70)-(289, 124 + ext), 0, BF
  LINE (30, 70)-(289, 124 + ext), c, B
  LINE (33, 73)-(286, 121 + ext), 13, B
  GPRINT 160 - LEN(txt$) * 7, 82, txt$, c, 3
  GPRINT 160 - LEN(note$) * 3, 108, note$, 9
END SUB

SUB Intro
  COLOR 9, 0
  CLS
  FOR i = 1 TO 30
    PSET (INT(RND * 320), INT(RND * 200)), 13
  NEXT i
  t$ = "LEVEL " + MID$(STR$(level), 2)
  GPRINT 160 - LEN(t$) * 5, 40, t$, 14, 2
  idx = (level - 1) MOD 8 + 1
  GPRINT 160 - LEN(lname$(idx)) * 8, 76, lname$(idx), 7, 3
  GPRINT 124, 130, "Get ready...", 12
  PLAY "MB WS T200 O4 L16 E G > C"
  SLEEP 1.6
END SUB

FUNCTION GameOver
  IF np = 1 AND score(1) > hiscore THEN hiscore = score(1): SaveHi: newHi = -1
  Card "GAME OVER", "", 4, 40
  COLOR 8, 0
  IF np = 1 THEN
    LOCATE 12, 15: PRINT "Score "; score(1); " Level "; level;
    IF newHi THEN COLOR 7, 0: LOCATE 14, 17: PRINT "NEW HIGH SCORE!";
  ELSE
    LOCATE 12, 11: PRINT "P1 "; score(1); "    P2 "; score(2);
    COLOR 7, 0
    IF score(1) > score(2) THEN
      LOCATE 14, 16: PRINT "Yellow worm wins!";
    ELSEIF score(2) > score(1) THEN
      LOCATE 14, 16: PRINT "Green worm wins!";
    ELSE
      LOCATE 14, 20: PRINT "A draw!";
    END IF
  END IF
  COLOR 9, 0
  LOCATE 16, 17: PRINT "Play again? (Y/N)";
  PLAY "MB WS T90 O3 L4 E D L2 C"
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "Y" OR k$ = "N" OR k$ = "Q" OR k$ = CHR$(27)
  GameOver = (k$ = "Y")
END FUNCTION

' ---------------------------------------------------- high score
SUB LoadHi
  hiscore = 0
  OPEN HIFILE FOR APPEND AS #1: CLOSE #1
  OPEN HIFILE FOR INPUT AS #1
  IF EOF(1) = 0 THEN INPUT #1, hiscore
  CLOSE #1
END SUB

SUB SaveHi
  OPEN HIFILE FOR OUTPUT AS #1
  PRINT #1, hiscore
  CLOSE #1
END SUB

' ---------------------------------------------------- the game
SUB PlayGame
  level = 1
  lives(1) = 3: lives(2) = 0
  IF np = 2 THEN lives(2) = 3
  score(1) = 0: score(2) = 0
  showIntro = -1
  DO
    IF showIntro THEN Intro
    SetupLevel
    res = RunLevel
    IF res = 3 THEN EXIT DO
    IF res = 1 THEN
      LevelClear
      level = level + 1
      showIntro = -1
    ELSE
      showIntro = 0
      IF lives(1) + lives(2) = 0 THEN EXIT DO
    END IF
  LOOP
END SUB

SUB SetupLevel
  FOR y = 0 TO GH - 1
    FOR x = 0 TO GW - 1: occ(x, y) = 0: NEXT x
  NEXT y
  COLOR 9, 0
  CLS
  LINE (0, TOP)-(319, 199), 1, BF
  LINE (0, TOP - 1)-(319, TOP - 1), 13
  BuildWalls
  FOR y = 0 TO GH - 1
    FOR x = 0 TO GW - 1
      IF occ(x, y) = 1 THEN DrawTile x, y, 1
    NEXT x
  NEXT y
  FOR p = 1 TO 2
    qn(p) = 0: grow(p) = 0: crash(p) = 0
    IF lives(p) > 0 THEN StartWorm p
  NEXT p
  foodn = 1
  PlaceFood
  Hud
END SUB

SUB StartWorm (p)
  ' five segments; P1 starts upper left heading right, P2 lower right heading left
  tl(p) = 0: hd(p) = 4
  FOR i = 0 TO 4
    IF p = 1 THEN x = 2 + i: y = 6 ELSE x = 37 - i: y = 16
    bxr(p, i) = x: byr(p, i) = y
    occ(x, y) = p + 1
    DrawTile x, y, p + 1
  NEXT i
  IF p = 1 THEN dr(p) = 1 ELSE dr(p) = 3
  DrawTile bxr(p, 4), byr(p, 4), p + 3
END SUB

SUB PlaceFood
  DO
    foodx = 1 + INT(RND * (GW - 2))
    foody = 1 + INT(RND * (GH - 2))
  LOOP UNTIL occ(foodx, foody) = 0
  occ(foodx, foody) = 4
  DrawTile foodx, foody, 6
END SUB

' returns 1 level cleared, 2 somebody crashed, 3 quit
FUNCTION RunLevel
  delay = MAX(0.05, 0.11 - (level - 1) * 0.007)
  gQuit = 0: gPause = 0
  nextT = TIMER + 0.4
  DO
    DO
      ReadKeys
      IF gQuit THEN RunLevel = 3: EXIT FUNCTION
      IF gPause THEN
        DoPause
        nextT = TIMER + delay
      END IF
      SLEEP 0.01
    LOOP UNTIL TIMER >= nextT OR TIMER < nextT - 10
    nextT = nextT + delay
    IF nextT < TIMER THEN nextT = TIMER + delay
    r = Advance
  LOOP UNTIL r <> 0
  RunLevel = r
END FUNCTION

SUB DoPause
  gPause = 0
  Card "PAUSED", "press P to continue", 7, 0
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "P" OR k$ = CHR$(27) OR k$ = "Q"
  IF k$ <> "P" THEN gQuit = -1
  IF gQuit = 0 THEN RedrawField
END SUB

SUB RedrawField
  LINE (0, TOP)-(319, 199), 1, BF
  FOR y = 0 TO GH - 1
    FOR x = 0 TO GW - 1
      k = occ(x, y)
      IF k = 1 THEN DrawTile x, y, 1
      IF k = 4 THEN DrawTile x, y, 6
    NEXT x
  NEXT y
  FOR p = 1 TO 2
    IF lives(p) > 0 THEN
      i = tl(p)
      DO
        DrawTile bxr(p, i), byr(p, i), p + 1
        IF i = hd(p) THEN EXIT DO
        i = (i + 1) MOD 512
      LOOP
      DrawTile bxr(p, hd(p)), byr(p, hd(p)), p + 3
    END IF
  NEXT p
END SUB

' one game tick: returns 0 go on, 1 level cleared, 2 crash
FUNCTION Advance
  FOR p = 1 TO 2
    IF lives(p) > 0 THEN
      IF qn(p) > 0 THEN
        dr(p) = qd(p, 1): qd(p, 1) = qd(p, 2): qn(p) = qn(p) - 1
      END IF
      nx(p) = bxr(p, hd(p)) + dxs(dr(p))
      ny(p) = byr(p, hd(p)) + dys(dr(p))
      ' the tail moves on unless the worm is still growing
      IF grow(p) > 0 THEN
        grow(p) = grow(p) - 1
      ELSE
        t = tl(p)
        occ(bxr(p, t), byr(p, t)) = 0
        DrawTile bxr(p, t), byr(p, t), 0
        tl(p) = (t + 1) MOD 512
      END IF
    END IF
  NEXT p
  anyCrash = 0
  FOR p = 1 TO 2
    crash(p) = 0
    IF lives(p) > 0 THEN
      c = occ(nx(p), ny(p))
      IF c = 1 OR c = 2 OR c = 3 THEN crash(p) = -1
    END IF
  NEXT p
  ' head-on: both worms want the same cell
  IF lives(1) > 0 AND lives(2) > 0 THEN
    IF nx(1) = nx(2) AND ny(1) = ny(2) THEN crash(1) = -1: crash(2) = -1
  END IF
  IF crash(1) OR crash(2) THEN
    Crashed
    Advance = 2
    EXIT FUNCTION
  END IF
  FOR p = 1 TO 2
    IF lives(p) > 0 THEN
      DrawTile bxr(p, hd(p)), byr(p, hd(p)), p + 1
      hd(p) = (hd(p) + 1) MOD 512
      bxr(p, hd(p)) = nx(p): byr(p, hd(p)) = ny(p)
      ate = (occ(nx(p), ny(p)) = 4)
      occ(nx(p), ny(p)) = p + 1
      DrawTile nx(p), ny(p), p + 3
      IF ate THEN Eat p
    END IF
  NEXT p
  IF foodn > LASTFOOD THEN Advance = 1
END FUNCTION

SUB Eat (p)
  score(p) = score(p) + foodn * 10
  grow(p) = grow(p) + 3 + foodn \ 3
  PLAY "MB WS T220 O5 L32 C E"
  foodn = foodn + 1
  IF foodn <= LASTFOOD THEN PlaceFood
  Hud
END SUB

SUB Crashed
  PLAY "MB WN V13 T140 O2 L8 C L4 C"
  FOR f = 1 TO 5
    FOR p = 1 TO 2
      IF crash(p) THEN
        IF f MOD 2 = 1 THEN c = 4 ELSE c = p + 1
        i = tl(p)
        DO
          DrawTile bxr(p, i), byr(p, i), 0
          IF c <> 0 THEN DrawTile bxr(p, i), byr(p, i), c
          IF i = hd(p) THEN EXIT DO
          i = (i + 1) MOD 512
        LOOP
      END IF
    NEXT p
    SLEEP 0.12
  NEXT f
  FOR p = 1 TO 2
    IF crash(p) THEN lives(p) = lives(p) - 1
  NEXT p
  Hud
  IF lives(1) + lives(2) = 0 THEN msg$ = "OUT OF LIVES" ELSE msg$ = "OUCH!"
  Card msg$, "", 4, 0
  SLEEP 1.4
END SUB

SUB LevelClear
  PLAY "MB WS T170 O4 L16 C E G > C E G L4 > C"
  FOR p = 1 TO 2
    IF lives(p) > 0 THEN score(p) = score(p) + 50 * level
  NEXT p
  Hud
  Card "LEVEL CLEAR!", "bonus " + MID$(STR$(50 * level), 2) + " each", 7, 0
  SLEEP 2.2
END SUB

' ---------------------------------------------------- input
SUB ReadKeys
  pw = 2
  IF np = 1 THEN pw = 1
  DO
    k$ = INKEY$
    IF k$ = "" THEN EXIT DO
    IF LEN(k$) = 2 THEN
      c$ = RIGHT$(k$, 1)
      IF c$ = "H" THEN Turn 1, 0
      IF c$ = "M" THEN Turn 1, 1
      IF c$ = "P" THEN Turn 1, 2
      IF c$ = "K" THEN Turn 1, 3
    ELSE
      u$ = UCASE$(k$)
      IF u$ = "W" THEN Turn pw, 0
      IF u$ = "D" THEN Turn pw, 1
      IF u$ = "S" THEN Turn pw, 2
      IF u$ = "A" THEN Turn pw, 3
      IF u$ = "P" THEN gPause = -1
      IF u$ = "Q" OR k$ = CHR$(27) THEN gQuit = -1
    END IF
  LOOP
END SUB

' queue a turn (at most two waiting); ignore reversals and repeats
SUB Turn (p, d)
  IF lives(p) <= 0 THEN EXIT SUB
  IF qn(p) > 0 THEN last = qd(p, qn(p)) ELSE last = dr(p)
  IF d = last OR d = (last + 2) MOD 4 THEN EXIT SUB
  IF qn(p) < 2 THEN
    qn(p) = qn(p) + 1
    qd(p, qn(p)) = d
  END IF
END SUB

' ---------------------------------------------------- drawing
' kinds: 0 empty, 1 brick, 2/3 body of P1/P2, 4/5 head of P1/P2, 6 food
SUB DrawTile (x, y, kind)
  px = x * 8: py = TOP + y * 8
  SELECT CASE kind
    CASE 0
      LINE (px, py)-(px + 7, py + 7), 1, BF
    CASE 1
      LINE (px, py)-(px + 7, py + 7), 13, BF
      LINE (px, py)-(px + 7, py), 14
      LINE (px, py + 4)-(px + 7, py + 4), 14
      LINE (px, py + 3)-(px + 7, py + 3), 2
      LINE (px, py + 7)-(px + 7, py + 7), 2
      LINE (px + 3, py)-(px + 3, py + 2), 2
      LINE (px + 6, py + 4)-(px + 6, py + 6), 2
    CASE 2
      LINE (px, py)-(px + 6, py + 6), 7, BF
    CASE 3
      LINE (px, py)-(px + 6, py + 6), 15, BF
    CASE 4, 5
      p = kind - 3
      IF p = 1 THEN c = 6 ELSE c = 9
      LINE (px, py)-(px + 6, py + 6), c, BF
      d = dr(p)
      IF d = 0 THEN PSET (px + 2, py + 1), 0: PSET (px + 4, py + 1), 0
      IF d = 1 THEN PSET (px + 5, py + 2), 0: PSET (px + 5, py + 4), 0
      IF d = 2 THEN PSET (px + 2, py + 5), 0: PSET (px + 4, py + 5), 0
      IF d = 3 THEN PSET (px + 1, py + 2), 0: PSET (px + 1, py + 4), 0
    CASE 6
      LINE (px, py)-(px + 7, py + 7), 3, BF
      LINE (px, py)-(px + 7, py + 7), 8, B
      GPRINT px + 2, py - 1, MID$(STR$(foodn), 2), 9
  END SELECT
END SUB

FUNCTION Pad$ (n)
  Pad$ = RIGHT$("00000" + MID$(STR$(n), 2), 5)
END FUNCTION

SUB Hud
  LINE (0, 0)-(319, TOP - 2), 0, BF
  COLOR 7, 0
  LOCATE 1, 1: PRINT "P1 "; Pad$(score(1)); " x"; lives(1);
  COLOR 8, 0
  LOCATE 1, 22
  PRINT "LV"; level; " food"; MIN(foodn, LASTFOOD); "/"; LASTFOOD;
  IF np = 2 THEN
    COLOR 15, 0
    LOCATE 1, 40: PRINT "P2 "; Pad$(score(2)); " x"; lives(2);
  ELSE
    COLOR 12, 0
    LOCATE 1, 40: PRINT "HI "; Pad$(MAX(hiscore, score(1)));
  END IF
END SUB

' ---------------------------------------------------- level designs
SUB Block (x1, y1, x2, y2)
  FOR y = y1 TO y2
    FOR x = x1 TO x2: occ(x, y) = 1: NEXT x
  NEXT y
END SUB

SUB BuildWalls
  Block 0, 0, GW - 1, 0
  Block 0, GH - 1, GW - 1, GH - 1
  Block 0, 0, 0, GH - 1
  Block GW - 1, 0, GW - 1, GH - 1
  SELECT CASE (level - 1) MOD 8 + 1
    CASE 1
      ' the meadow: just the fence
    CASE 2
      Block 10, 4, 11, 5: Block 28, 4, 29, 5
      Block 10, 17, 11, 18: Block 28, 17, 29, 18
      Block 19, 9, 20, 13
    CASE 3
      Block 6, 9, 33, 9
      Block 6, 13, 33, 13
    CASE 4
      Block 19, 3, 20, 8: Block 19, 14, 20, 19
      Block 8, 11, 14, 11: Block 25, 11, 31, 11
    CASE 5
      Block 12, 6, 17, 6: Block 22, 6, 27, 6
      Block 12, 16, 17, 16: Block 22, 16, 27, 16
      Block 12, 7, 12, 9: Block 12, 13, 12, 15
      Block 27, 7, 27, 9: Block 27, 13, 27, 15
    CASE 6
      FOR i = 0 TO 4
        x = 12 + i * 4
        IF i MOD 2 = 0 THEN Block x, 1, x, 13 ELSE Block x, 9, x, 21
      NEXT i
    CASE 7
      Block 8, 3, 8, 10: Block 8, 10, 20, 10
      Block 20, 10, 20, 19: Block 20, 19, 32, 19
      Block 32, 12, 32, 19
    CASE 8
      Block 6, 3, 16, 3: Block 23, 3, 33, 3
      Block 6, 19, 16, 19: Block 23, 19, 33, 19
      Block 16, 9, 23, 13
      Block 5, 11, 6, 12: Block 33, 10, 34, 11
  END SELECT
  ' keep both starting yards clear
  FOR y = 5 TO 7
    FOR x = 1 TO 10: occ(x, y) = 0: NEXT x
  NEXT y
  FOR y = 15 TO 17
    FOR x = 29 TO 38: occ(x, y) = 0: NEXT x
  NEXT y
END SUB
