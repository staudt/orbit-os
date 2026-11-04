REM ===================================================
REM  TRADER.BAS - ORBIT TRADER
REM  A freelance hauler, a small ship, a loan from the
REM  Ring Bank and 30 days. Buy low, jump, sell high,
REM  and retire as rich as you can (cash minus debt).
REM  B buy  S sell  J jump  R refuel  P pay loan (bank)
REM  U upgrade holds (shipyards)  X retire  Q save+quit
REM ===================================================
DIM SHARED today, here, cash, debt, holds, fuel, logOn, myHull, foeHull
DIM SHARED cargo(6), cost(6), drift(6, 6), shock(6, 6), mpct(6, 6), gbase(6)
DIM SHARED gname$(6), pname$(6), pkind$(6), pblurb$(6), pnum$(6)
DIM SHARED px(6), py(6), pcol(6), fuelPr(6), canUp(6)
DIM SHARED evGood(6), evPct(6), ml$(3), mc(3)
DIM SHARED sx(59), sy(59), hsName$(5), hsScore(5)
DIM SHARED savePath$, hiPath$
CONST MAXDAYS = 30
CONST TANK = 50
CONST LOAN = 3000
RANDOMIZE TIMER
savePath$ = "/Documents/TRADER.SAV"
hiPath$ = "/Documents/TRADER.HI"

' ---- the six ports: name, kind, blurb, map x, map y, colour, fuel price, shipyard
FOR i = 0 TO 6
  READ pname$(i), pkind$(i), pblurb$(i), px(i), py(i), pcol(i), fuelPr(i), canUp(i)
  pnum$(i) = LTRIM$(STR$(i + 1))
NEXT i
DATA "Cinder Moon", "sunbaked mining moon", "Red dust, grinding rigs, ore to the horizon.", 40, 92, 6, 9, 0
DATA "Gilded Lantern", "orbital casino", "Slot chimes drift through every airlock.", 245, 36, 3, 13, 0
DATA "Marigold", "farm world", "Golden terraces. The air smells of warm bread.", 48, 38, 15, 10, 0
DATA "Halcyon Deep", "research station", "Humming labs and very absent-minded doctors.", 122, 104, 14, 12, 1
DATA "Redjack's Rock", "pirate rock", "No law here but the tab. Mind your hold.", 288, 74, 4, 15, 0
DATA "Aurelia Ring", "Ring Bank", "Polished floors and patient accountants.", 140, 62, 7, 10, 0
DATA "Tamarind Yard", "shipyard", "Welders spark, hulls ring, bays are for rent.", 205, 96, 10, 10, 1

' ---- goods and their galaxy-wide average price
FOR i = 0 TO 6
  READ gname$(i), gbase(i)
NEXT i
DATA "Food", 15, "Ore", 30, "Medicine", 60, "Parts", 100
DATA "Luxuries", 180, "Crystals", 300, "Contraband", 220

' ---- price modifier in percent: port (row) x good (column). 0 = not traded
FOR i = 0 TO 6
  FOR j = 0 TO 6
    READ mpct(i, j)
  NEXT j
NEXT i
'     Food Ore  Med Parts Lux Cryst Contra
DATA 124, 73, 118, 94, 112, 106, 100
DATA 112, 118, 100, 118, 79, 109, 118
DATA 70, 106, 94, 88, 118, 103, 112
DATA 115, 100, 82, 112, 106, 76, 0
DATA 118, 94, 130, 103, 91, 118, 73
DATA 100, 103, 103, 106, 100, 97, 0
DATA 106, 118, 100, 73, 97, 100, 109

' ---- market events: which good, and how hard the shock hits (percent)
evGood(0) = 2: evPct(0) = 70
evGood(1) = 0: evPct(1) = -35
evGood(2) = 1: evPct(2) = 50
evGood(3) = 4: evPct(3) = 60
evGood(4) = 5: evPct(4) = -35
evGood(5) = 3: evPct(5) = 50
evGood(6) = 6: evPct(6) = 50

FOR i = 0 TO 59
  sx(i) = INT(RND * 320): sy(i) = INT(RND * 200)
NEXT i

LoadHi
DO
  choice = TitleScreen
  IF choice = 0 THEN EXIT DO
  IF choice = 1 THEN NewGame
  IF choice = 2 THEN LoadGame
  PlayGame
LOOP
COLOR 9, 0
CLS
PRINT "Fly safe, hauler."
END

' ---------------------------------------------------- small helpers
FUNCTION Fmt$ (n)
  Fmt$ = LTRIM$(STR$(n))
END FUNCTION

' right-justify a number in a field of w characters
FUNCTION RJ$ (n, w)
  RJ$ = RIGHT$(SPACE$(w) + LTRIM$(STR$(n)), w)
END FUNCTION

' left-justify text in a field of w characters
FUNCTION LJ$ (t$, w)
  LJ$ = LEFT$(t$ + SPACE$(w), w)
END FUNCTION

FUNCTION GetKey$
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.03
  LOOP UNTIL k$ <> ""
  GetKey$ = k$
END FUNCTION

FUNCTION Used
  t = 0
  FOR g = 0 TO 6: t = t + cargo(g): NEXT g
  Used = t
END FUNCTION

' today's price of good g at port p (0 when the port does not trade it)
FUNCTION Price (p, g)
  IF mpct(p, g) = 0 THEN
    Price = 0
  ELSE
    v = gbase(g) * mpct(p, g) / 100 * (100 + drift(p, g) + shock(p, g)) / 100
    Price = MAX(1, INT(v + 0.5))
  END IF
END FUNCTION

' fuel units needed to jump from port a to port b
FUNCTION Need (a, b)
  d = SQR((px(a) - px(b)) ^ 2 + (py(a) - py(b)) ^ 2)
  Need = INT(d / 9) + 1
END FUNCTION

' days a jump of f fuel takes
FUNCTION DaysFor (f)
  DaysFor = 1 + (f - 1) \ 14
END FUNCTION

FUNCTION CanReach (b)
  f = Need(here, b)
  CanReach = (b <> here) AND (f <= fuel) AND (today + DaysFor(f) <= MAXDAYS)
END FUNCTION

SUB Chime (kind)
  SELECT CASE kind
    CASE 1: PLAY "MB T220 O4 L16 E G"
    CASE 2: PLAY "MB T240 O5 L32 C E G > C"
    CASE 3: PLAY "MB T150 O4 L8 E G > C L4 E"
    CASE 4: SOUND 160, 3
    CASE 5: PLAY "MB T120 O3 L16 C E G > C E G L4 > C"
  END SELECT
END SUB

SUB DrawStars
  FOR i = 0 TO 59
    PSET (sx(i), sy(i)), 12 - (i MOD 3 = 0) * 2 - (i MOD 7 = 0) * 3
  NEXT i
END SUB

' ---------------------------------------------------- the world
SUB NewGame
  today = 1: here = 5
  cash = 1000: debt = LOAN
  holds = 20: fuel = TANK
  FOR g = 0 TO 6
    cargo(g) = 0: cost(g) = 0
  NEXT g
  FOR p = 0 TO 6
    FOR g = 0 TO 6
      drift(p, g) = INT(RND * 31) - 15
      shock(p, g) = 0
    NEXT g
  NEXT p
  FOR i = 1 TO 3: ml$(i) = "": mc(i) = 9: NEXT i
  logOn = 1
  Msg "The Ring Bank staked you $3000 at 2.5% a day.", 7
  Msg "30 days. Make it count, hauler.", 9
  SaveGame
END SUB

' prices wander a little each day; shocks from news fade away
SUB NextDay
  FOR p = 0 TO 6
    FOR g = 0 TO 6
      v = INT(drift(p, g) * 0.6 + (RND - 0.5) * 28 + 0.5)
      drift(p, g) = MAX(-30, MIN(30, v))
      shock(p, g) = FIX(shock(p, g) * 0.75)
    NEXT g
  NEXT p
END SUB

SUB RandomEvent
  IF RND > 0.35 THEN EXIT SUB
  t = INT(RND * 7)
  g = evGood(t)
  DO
    p = INT(RND * 7)
  LOOP UNTIL mpct(p, g) > 0
  shock(p, g) = evPct(t)
  n$ = pname$(p)
  SELECT CASE t
    CASE 0: Msg "A plague on " + n$ + ": medicine prices soar!", 7
    CASE 1: Msg "Bumper harvest at " + n$ + ": food is nearly free.", 7
    CASE 2: Msg "Strike at " + n$ + ": ore is scarce and dear.", 7
    CASE 3: Msg "Grand gala on " + n$ + ": luxuries sell out!", 7
    CASE 4: Msg "Data leak floods " + n$ + " with cheap crystals.", 7
    CASE 5: Msg "Reactor trouble at " + n$ + ": parts in demand.", 7
    CASE 6: Msg "Crackdown near " + n$ + ": contraband pays well.", 7
  END SELECT
END SUB

' ---------------------------------------------------- the main screen
SUB Msg (t$, c)
  ' long lines are split at a space so they fit the log
  a$ = t$: b$ = ""
  IF LEN(a$) > 51 THEN
    k = 51
    WHILE k > 1 AND MID$(a$, k, 1) <> " "
      k = k - 1
    WEND
    b$ = MID$(a$, k + 1): a$ = LEFT$(a$, k - 1)
  END IF
  PushLog a$, c
  IF b$ <> "" THEN PushLog b$, c
  IF logOn <> 0 THEN ShowLog
END SUB

SUB PushLog (t$, c)
  ml$(1) = ml$(2): mc(1) = mc(2)
  ml$(2) = ml$(3): mc(2) = mc(3)
  ml$(3) = t$: mc(3) = c
END SUB

SUB ShowLog
  FOR i = 1 TO 3
    LOCATE 13 + i, 1
    COLOR 9, 0: PRINT SPACE$(53);
    COLOR mc(i), 0
    LOCATE 13 + i, 2: PRINT ml$(i);
  NEXT i
END SUB

SUB ShowStatus
  COLOR 9, 1
  LOCATE 1, 1: PRINT SPACE$(53);
  LOCATE 1, 2: PRINT "Day ";
  COLOR 8, 1: PRINT Fmt$(today); "/"; Fmt$(MAXDAYS);
  COLOR 9, 1: PRINT "  ";
  COLOR 7, 1: PRINT "$"; Fmt$(cash);
  COLOR 9, 1: PRINT "  Debt ";
  IF debt > 0 THEN COLOR 6, 1 ELSE COLOR 15, 1
  PRINT Fmt$(debt);
  COLOR 9, 1: PRINT "  Hold ";
  COLOR 8, 1: PRINT Fmt$(Used); "/"; Fmt$(holds);
  COLOR 9, 1: PRINT "  Fuel ";
  COLOR 8, 1: PRINT Fmt$(fuel);
END SUB

SUB ShowMarket
  COLOR 7, 0
  LOCATE 3, 1: PRINT SPACE$(53);
  LOCATE 3, 2: PRINT UCASE$(pname$(here)); " - "; pkind$(here);
  COLOR 12, 0
  LOCATE 4, 1: PRINT SPACE$(53);
  LOCATE 4, 2: PRINT pblurb$(here);
  COLOR 10, 0
  LOCATE 5, 4: PRINT "Good";
  LOCATE 5, 16: PRINT "Price";
  LOCATE 5, 23: PRINT " Paid";
  LOCATE 5, 29: PRINT "Have";
  LOCATE 5, 35: PRINT " Avg";
  LOCATE 5, 42: PRINT "Market";
  FOR g = 0 TO 6
    r = 6 + g
    pr = Price(here, g)
    COLOR 9, 0
    LOCATE r, 1: PRINT SPACE$(53);
    COLOR 7, 0
    LOCATE r, 2: PRINT pnum$(g);
    COLOR 9, 0
    LOCATE r, 4: PRINT gname$(g);
    LOCATE r, 35: PRINT RJ$(gbase(g), 4);
    IF pr = 0 THEN
      COLOR 11, 0
      LOCATE r, 16: PRINT "   --";
      LOCATE r, 42: PRINT "no trade";
    ELSE
      IF pr * 100 <= gbase(g) * 85 THEN
        c = 15: t$ = "CHEAP"
      ELSEIF pr * 100 >= gbase(g) * 115 THEN
        c = 4: t$ = "DEAR"
      ELSE
        c = 9: t$ = "fair"
      END IF
      COLOR c, 0
      LOCATE r, 16: PRINT RJ$(pr, 5);
      LOCATE r, 42: PRINT t$;
    END IF
    IF cargo(g) > 0 THEN
      COLOR 10, 0
      LOCATE r, 23: PRINT RJ$(cost(g), 5);
      COLOR 7, 0
      LOCATE r, 29: PRINT RJ$(cargo(g), 4);
    ELSE
      COLOR 11, 0
      LOCATE r, 23: PRINT "    -";
      LOCATE r, 29: PRINT "   -";
    END IF
  NEXT g
END SUB

SUB MenuKey (k$, w$)
  COLOR 7, 0: PRINT k$; " ";
  COLOR 9, 0: PRINT w$; "  ";
END SUB

SUB ShowMenu
  COLOR 9, 0
  LOCATE 17, 1: PRINT SPACE$(53);
  LOCATE 18, 1: PRINT SPACE$(53);
  LOCATE 17, 2
  MenuKey "B", "Buy"
  MenuKey "S", "Sell"
  MenuKey "J", "Jump"
  MenuKey "R", "Refuel ($" + Fmt$(fuelPr(here)) + ")"
  LOCATE 18, 2
  IF here = 5 THEN MenuKey "P", "Pay loan"
  IF canUp(here) <> 0 THEN MenuKey "U", "Bigger holds"
  MenuKey "X", "Retire"
  MenuKey "Q", "Quit"
END SUB

SUB ClearPrompt
  COLOR 9, 0
  LOCATE 19, 1: PRINT SPACE$(53);
  LOCATE 20, 1: PRINT SPACE$(52);
  LOCATE 19, 2
END SUB

SUB Refresh
  ShowStatus
  ShowMarket
  ShowLog
  ShowMenu
  ClearPrompt
END SUB

SUB RedrawAll
  COLOR 9, 0
  CLS
  Refresh
END SUB

' ask a quantity: Enter or A takes the maximum, Esc cancels
FUNCTION AskQty (what$, maxq)
  ClearPrompt
  COLOR 7, 0
  PRINT what$; " how many? (max "; Fmt$(maxq); ") ";
  LINE INPUT "", a$
  a$ = UCASE$(TRIM$(a$))
  IF a$ = "" OR a$ = "A" OR a$ = "M" THEN
    q = maxq
  ELSE
    q = INT(VAL(a$))
  END IF
  IF q < 0 THEN q = 0
  IF q > maxq THEN q = maxq
  ClearPrompt
  AskQty = q
END FUNCTION

' choose a good by number; returns -1 on cancel
FUNCTION PickGood (verb$)
  ClearPrompt
  COLOR 7, 0
  PRINT verb$; " which good? (1-7, Esc = back)";
  PickGood = -1
  DO
    k$ = GetKey$
    IF k$ >= "1" AND k$ <= "7" THEN PickGood = VAL(k$) - 1: EXIT DO
  LOOP UNTIL k$ = CHR$(27) OR k$ = "Q"
  ClearPrompt
END FUNCTION

FUNCTION AskYN (q$)
  ClearPrompt
  COLOR 7, 0
  PRINT q$; " (Y/N) ";
  DO
    k$ = GetKey$
  LOOP UNTIL k$ = "Y" OR k$ = "N" OR k$ = CHR$(27)
  AskYN = (k$ = "Y")
  ClearPrompt
END FUNCTION

SUB DoBuy
  g = PickGood("Buy")
  IF g < 0 THEN EXIT SUB
  pr = Price(here, g)
  IF pr = 0 THEN
    Msg "Nobody sells " + LCASE$(gname$(g)) + " here.", 10
    Chime 4
    EXIT SUB
  END IF
  free = holds - Used
  mx = MIN(cash \ pr, free)
  IF mx <= 0 THEN
    IF free <= 0 THEN Msg "Your holds are full.", 12 ELSE Msg "You can't afford any.", 12
    Chime 4
    EXIT SUB
  END IF
  q = AskQty("Buy " + gname$(g) + " @ $" + Fmt$(pr) + ",", mx)
  IF q > 0 THEN
    cost(g) = (cost(g) * cargo(g) + pr * q) / (cargo(g) + q)
    cargo(g) = cargo(g) + q
    cash = cash - pr * q
    Chime 1
    Msg "Bought " + Fmt$(q) + " " + gname$(g) + " for $" + Fmt$(pr * q) + ".", 15
  END IF
  Refresh
END SUB

SUB DoSell
  g = PickGood("Sell")
  IF g < 0 THEN EXIT SUB
  pr = Price(here, g)
  IF pr = 0 THEN
    Msg "Nobody here wants " + LCASE$(gname$(g)) + ".", 10
    Chime 4
    EXIT SUB
  END IF
  IF cargo(g) <= 0 THEN
    Msg "You have none to sell.", 10
    Chime 4
    EXIT SUB
  END IF
  q = AskQty("Sell " + gname$(g) + " @ $" + Fmt$(pr) + ",", cargo(g))
  IF q > 0 THEN
    gain = (pr - cost(g)) * q
    cash = cash + pr * q
    cargo(g) = cargo(g) - q
    IF cargo(g) = 0 THEN cost(g) = 0
    Chime 2
    IF gain >= 0 THEN
      Msg "Sold " + Fmt$(q) + " " + gname$(g) + " for $" + Fmt$(pr * q) + " (+$" + Fmt$(gain) + ").", 15
    ELSE
      Msg "Sold " + Fmt$(q) + " " + gname$(g) + " for $" + Fmt$(pr * q) + " (-$" + Fmt$(-gain) + ").", 6
    END IF
  END IF
  Refresh
END SUB

SUB DoRefuel
  room = TANK - fuel
  IF room <= 0 THEN
    Msg "The tank is already full.", 10
    EXIT SUB
  END IF
  mx = MIN(room, cash \ fuelPr(here))
  IF mx <= 0 THEN
    Msg "You can't afford fuel.", 10
    Chime 4
    EXIT SUB
  END IF
  q = AskQty("Fuel @ $" + Fmt$(fuelPr(here)) + ",", mx)
  IF q > 0 THEN
    fuel = fuel + q
    cash = cash - q * fuelPr(here)
    Chime 1
    Msg "Took on " + Fmt$(q) + " fuel for $" + Fmt$(q * fuelPr(here)) + ".", 15
  END IF
  Refresh
END SUB

SUB DoPay
  IF here <> 5 THEN
    Msg "Only the Ring Bank takes loan payments.", 10
    EXIT SUB
  END IF
  IF debt <= 0 THEN
    Msg "You owe the bank nothing. Lovely.", 15
    EXIT SUB
  END IF
  mx = MIN(cash, debt)
  IF mx <= 0 THEN
    Msg "Your pockets are empty.", 10
    Chime 4
    EXIT SUB
  END IF
  q = AskQty("Pay the bank,", mx)
  IF q > 0 THEN
    cash = cash - q
    debt = debt - q
    Chime 2
    IF debt = 0 THEN
      Msg "Debt cleared! The clerk actually smiles.", 15
    ELSE
      Msg "Paid $" + Fmt$(q) + ". You still owe $" + Fmt$(debt) + ".", 15
    END IF
  END IF
  Refresh
END SUB

SUB DoUpgrade
  IF canUp(here) = 0 THEN
    Msg "No yard here fits bigger holds.", 10
    EXIT SUB
  END IF
  IF holds >= 50 THEN
    Msg "Your hull can't take any more holds.", 10
    EXIT SUB
  END IF
  c = 1000 + (holds - 20) * 60
  IF cash < c THEN
    Msg "+10 holds costs $" + Fmt$(c) + ". You're short.", 10
    Chime 4
    EXIT SUB
  END IF
  IF AskYN("Add 10 holds for $" + Fmt$(c) + "?") THEN
    cash = cash - c
    holds = holds + 10
    Chime 5
    Msg "Welders at work: you now have " + Fmt$(holds) + " holds.", 15
  END IF
  Refresh
END SUB

' ---------------------------------------------------- the game loop
SUB PlayGame
  logOn = 1
  RedrawAll
  done = 0
  DO
    k$ = UCASE$(INKEY$)
    SELECT CASE k$
      CASE "B": DoBuy
      CASE "S": DoSell
      CASE "R": DoRefuel
      CASE "P": DoPay
      CASE "U": DoUpgrade
      CASE "J"
        r = DoJump
        IF r = 2 THEN done = 1
      CASE "X"
        IF AskYN("Retire now and cash out?") THEN Retire: done = 1
      CASE "Q"
        IF AskYN("Save and return to the title?") THEN SaveGame: done = 1
    END SELECT
    SLEEP 0.03
  LOOP UNTIL done <> 0
END SUB

' returns 2 when the game is over
FUNCTION DoJump
  DoJump = 0
  IF today >= MAXDAYS THEN
    Msg "Day 30. No time left for another jump.", 7
    IF AskYN("Retire and cash out?") THEN Retire: DoJump = 2
    EXIT FUNCTION
  END IF
  dest = ChooseDest
  IF dest < 0 THEN
    RedrawAll
    EXIT FUNCTION
  END IF
  f = Need(here, dest)
  d = DaysFor(f)
  fuel = fuel - f
  FOR i = 1 TO d: NextDay: NEXT i
  today = today + d
  IF debt > 0 THEN debt = debt + INT(debt * 0.025 * d + 0.5)
  Warp
  Encounter
  here = dest
  Arrive
END FUNCTION

SUB Arrive
  logOn = 1
  Chime 3
  Msg "Docked at " + pname$(here) + " (day " + Fmt$(today) + ").", 8
  IF debt > 0 THEN Msg "Interest pushes your debt to $" + Fmt$(debt) + ".", 6
  RandomEvent
  IF today >= MAXDAYS THEN Msg "Last day! Sell up, then press X to retire.", 7
  SaveGame
  RedrawAll
END SUB

SUB Warp
  COLOR 9, 0
  CLS
  PLAY "MB T240 O3 L32 C E G > C E G > C E G"
  FOR f = 1 TO 14
    FADE
    FOR i = 1 TO 16
      a = RND * 6.283
      r1 = 8 + f * 7
      r2 = r1 + 6 + f * 2
      LINE (160 + COS(a) * r1, 100 + SIN(a) * r1 * 0.62)-(160 + COS(a) * r2, 100 + SIN(a) * r2 * 0.62), 8 + (i MOD 3) * 3
    NEXT i
    SLEEP 0.035
  NEXT f
  CLS
END SUB

' ---------------------------------------------------- the star map
SUB DrawMap (sel)
  COLOR 9, 0
  CLS
  DrawStars
  ShowStatus
  COLOR 12, 0
  LOCATE 2, 2: PRINT "STAR MAP - choose a destination";
  ' the route line to the selected port
  IF sel >= 0 THEN LINE (px(here), py(here))-(px(sel), py(sel)), 7
  FOR i = 0 TO 6
    LINE (px(i) - 2, py(i) - 2)-(px(i) + 2, py(i) + 2), pcol(i), BF
    CIRCLE (px(i), py(i)), 4, pcol(i)
    lab$ = pnum$(i) + " " + pname$(i)
    c = 12
    IF CanReach(i) THEN c = 9
    IF i = here OR i = sel THEN c = 7
    IF px(i) > 215 THEN lx = px(i) - 13 - LEN(lab$) * 5 ELSE lx = px(i) + 13
    GPRINT lx, py(i) - 4, lab$, c
  NEXT i
  ' you are here
  CIRCLE (px(here), py(here)), 8, 7
  CIRCLE (px(here), py(here)), 10, 8
  IF sel >= 0 THEN CIRCLE (px(sel), py(sel)), 8, 15
  ' list with costs
  FOR i = 0 TO 6
    IF i < 4 THEN
      r = 14 + i: cl = 2
    ELSE
      r = 14 + i - 4: cl = 28
    END IF
    IF i = here THEN
      COLOR 7, 0
      LOCATE r, cl: PRINT pnum$(i); " "; LJ$(pname$(i), 15); "here";
    ELSE
      f = Need(here, i)
      c = 12
      IF CanReach(i) THEN c = 9
      IF i = sel THEN c = 7
      COLOR c, 0
      LOCATE r, cl: PRINT pnum$(i); " "; LJ$(pname$(i), 15); RJ$(f, 2); "f "; Fmt$(DaysFor(f)); "d";
    END IF
  NEXT i
  COLOR 10, 0
  LOCATE 19, 2
  IF sel < 0 THEN
    PRINT "Press 1-7 (or click a port). Esc = back.";
  ELSEIF CanReach(sel) THEN
    PRINT "Jump to "; pname$(sel); "? Enter = go, Esc = back";
  ELSEIF Need(here, sel) > fuel THEN
    COLOR 4, 0
    PRINT "Not enough fuel for that jump ("; Fmt$(fuel); " left).";
  ELSE
    COLOR 4, 0
    PRINT "Not enough days left for that jump.";
  END IF
END SUB

' returns the chosen port, or -1 to stay
FUNCTION ChooseDest
  sel = -1
  DrawMap sel
  wasDown = MOUSEB
  ChooseDest = -1
  DO
    pick = -1
    k$ = INKEY$
    b = MOUSEB
    IF b <> 0 AND wasDown = 0 THEN
      FOR i = 0 TO 6
        IF ABS(MOUSEX - px(i)) < 10 AND ABS(MOUSEY - py(i)) < 10 THEN pick = i
      NEXT i
    END IF
    wasDown = b
    IF k$ >= "1" AND k$ <= "7" THEN pick = VAL(k$) - 1
    IF pick >= 0 THEN
      IF pick = sel AND CanReach(pick) THEN ChooseDest = pick: EXIT DO
      IF pick <> here THEN sel = pick: DrawMap sel
    END IF
    IF k$ = CHR$(13) AND sel >= 0 THEN
      IF CanReach(sel) THEN ChooseDest = sel: EXIT DO
    END IF
    IF k$ = CHR$(27) OR UCASE$(k$) = "Q" OR UCASE$(k$) = "J" THEN EXIT DO
    SLEEP 0.02
  LOOP
END FUNCTION

' ---------------------------------------------------- encounters
SUB Encounter
  IF RND > 0.3 THEN EXIT SUB
  logOn = 0
  r = RND
  IF r < 0.4 THEN
    Pirates
  ELSEIF r < 0.62 THEN
    Customs
  ELSEIF r < 0.82 THEN
    Derelict
  ELSE
    Stranded
  END IF
  logOn = 1
END SUB

' a little ship, nose pointing in direction dr (1 right, -1 left)
SUB DrawShip (x, y, c, dr)
  x2 = x + dr * 30
  LINE (x, y - 6)-(x2, y + 6), c, BF
  LINE (x2, y - 6)-(x2 + dr * 14, y), c
  LINE (x2 + dr * 14, y)-(x2, y + 6), c
  PAINT (x2 + dr * 4, y), c, c
  LINE (x + dr * 5, y - 6)-(x - dr * 5, y - 17), c
  LINE (x - dr * 5, y - 17)-(x + dr * 16, y - 6), c
  LINE (x + dr * 5, y + 6)-(x - dr * 5, y + 17), c
  LINE (x - dr * 5, y + 17)-(x + dr * 16, y + 6), c
  LINE (x2 - dr * 12, y - 2)-(x2 - dr * 6, y + 2), 7, BF
  LINE (x - dr * 2, y - 3)-(x - dr * 8, y + 3), 6, BF
END SUB

SUB ClearRows (r1, r2)
  COLOR 9, 0
  FOR r = r1 TO r2
    LOCATE r, 1
    IF r = 20 THEN PRINT SPACE$(52); ELSE PRINT SPACE$(53);
  NEXT r
END SUB

SUB Say (row, t$, c)
  COLOR c, 0
  LOCATE row, 1: PRINT SPACE$(53);
  LOCATE row, 2: PRINT t$;
END SUB

' the scene: kind 1 pirate, 2 customs, 3 derelict, 4 stranded trader
SUB DrawSpace (kind)
  COLOR 9, 0
  CLS
  DrawStars
  DrawShip 40, 55, 10, 1
  SELECT CASE kind
    CASE 1: DrawShip 280, 55, 4, -1
    CASE 2: DrawShip 280, 55, 14, -1
    CASE 3: DrawShip 280, 55, 11, -1
    CASE 4: DrawShip 280, 55, 6, -1
  END SELECT
  IF kind = 3 THEN
    LINE (262, 40)-(272, 50), 0, BF
    LINE (236, 66)-(250, 74), 0, BF
  END IF
  ShowStatus
END SUB

FUNCTION Bar$ (n, total)
  s$ = ""
  FOR i = 1 TO total
    IF i <= n THEN s$ = s$ + "#" ELSE s$ = s$ + "."
  NEXT i
  Bar$ = s$
END FUNCTION

SUB EncounterEnd
  ShowStatus
  ClearRows 17, 18
  Say 19, "[press a key]", 11
  k$ = GetKey$
END SUB

SUB Pirates
  DrawSpace 1
  foeHull = 3 + INT(RND * 3)
  myHull = 5
  tribute = MAX(150, INT(cash * 0.2))
  SOUND 300, 2: SOUND 220, 2: SOUND 300, 2: SOUND 220, 2
  Say 10, "ALERT! A pirate corsair drops out of the dark.", 4
  Say 11, "'Cargo or credits, hauler. Your pick.'", 10
  done = 0
  DO
    Say 13, "Corsair [" + Bar$(foeHull, 5) + "]    Your hull [" + Bar$(myHull, 5) + "]", 9
    Say 17, "F Fight   R Run   P Pay tribute ($" + Fmt$(tribute) + ")", 7
    k$ = GetKey$
    IF k$ = "F" THEN
      a = INT(RND * 6) + 1: b = INT(RND * 6) + 1
      LINE (84, 55)-(230, 55), 8
      SOUND 900, 1
      LINE (84, 55)-(230, 55), 0
      IF a >= 4 THEN
        foeHull = foeHull - 1
        Say 14, "You fire [" + Fmt$(a) + "]: HIT! Sparks fly off the corsair.", 15
        SOUND 200, 1
      ELSE
        Say 14, "You fire [" + Fmt$(a) + "]: a clean miss.", 10
      END IF
      IF foeHull > 0 THEN
        LINE (226, 56)-(88, 56), 4
        SOUND 600, 1
        LINE (226, 56)-(88, 56), 0
        IF b >= 4 THEN
          myHull = myHull - 1
          Say 15, "Corsair fires [" + Fmt$(b) + "]: it hits! Alarms howl.", 6
          SOUND 120, 2
        ELSE
          Say 15, "Corsair fires [" + Fmt$(b) + "]: it whistles past.", 10
        END IF
      ELSE
        Say 15, "", 9
      END IF
    ELSEIF k$ = "R" THEN
      a = INT(RND * 6) + 1
      fuel = MAX(0, fuel - 2)
      IF a >= 4 THEN
        Say 14, "You burn hard [" + Fmt$(a) + "] and slip away. (-2 fuel)", 15
        Say 15, "", 9
        Msg "You outran a pirate corsair, but burned 2 fuel.", 8
        done = 1
      ELSE
        Say 14, "You run [" + Fmt$(a) + "] but they stay on your tail!", 10
        b = INT(RND * 6) + 1
        IF b >= 4 THEN
          myHull = myHull - 1
          Say 15, "A parting shot [" + Fmt$(b) + "] rakes your hull.", 6
          SOUND 120, 2
        ELSE
          Say 15, "Their parting shot [" + Fmt$(b) + "] goes wide.", 10
        END IF
      END IF
    ELSEIF k$ = "P" THEN
      IF cash >= tribute THEN
        cash = cash - tribute
        Say 14, "You wire them $" + Fmt$(tribute) + ". The corsair peels away.", 10
        Say 15, "'Pleasure doing business.'", 10
        Msg "Paid pirates $" + Fmt$(tribute) + " to leave you alone.", 6
      ELSE
        cash = cash \ 2
        FOR g = 0 TO 6: cargo(g) = cargo(g) \ 2: NEXT g
        Say 14, "You can't cover it. They take half the hold", 6
        Say 15, "and half your credits. Ouch.", 6
        Msg "Pirates fleeced you: half your cash and cargo.", 6
      END IF
      done = 1
    END IF
    IF done = 0 AND foeHull <= 0 THEN
      loot = 120 + INT(RND * 300)
      cash = cash + loot
      Say 14, "The corsair breaks apart! You find $" + Fmt$(loot) + " in the wreck.", 15
      Say 15, "", 9
      Chime 5
      Msg "You beat a pirate corsair and looted $" + Fmt$(loot) + ".", 15
      done = 1
    ELSEIF done = 0 AND myHull <= 0 THEN
      cash = cash - cash * 3 \ 10
      FOR g = 0 TO 6: cargo(g) = cargo(g) \ 3: NEXT g
      Say 14, "Your hull gives out. The pirates board and strip", 4
      Say 15, "you of most of your cargo and 30% of your cash.", 4
      SOUND 60, 6
      Msg "Pirates stripped your hold and 30% of your cash.", 4
      done = 1
    END IF
    Say 13, "Corsair [" + Bar$(MAX(foeHull, 0), 5) + "]    Your hull [" + Bar$(MAX(myHull, 0), 5) + "]", 9
  LOOP UNTIL done <> 0
  EncounterEnd
END SUB

SUB Customs
  DrawSpace 2
  Say 10, "A customs cutter hails you: 'Stand by for a scan.'", 14
  PLAY "T200 O5 L16 C E C E"
  SLEEP 0.8
  IF cargo(6) <= 0 THEN
    Say 12, "Scan complete. Hold clean, papers in order.", 15
    Say 13, "'Safe travels, citizen.'", 10
    Msg "Customs scanned you: all clear.", 8
  ELSE
    fine = MIN(cash, 200 + cargo(6) * 25)
    bribe = fine \ 2 + 50
    Say 12, "Scan complete. CONTRABAND in the hold!", 4
    Say 13, "'" + Fmt$(cargo(6)) + " units. That's a fine of $" + Fmt$(fine) + ".'", 10
    Say 17, "S Submit   B Bribe the officer ($" + Fmt$(bribe) + ")", 7
    DO
      k$ = GetKey$
    LOOP UNTIL k$ = "S" OR (k$ = "B" AND cash >= bribe)
    IF k$ = "B" AND RND < 0.55 THEN
      cash = cash - bribe
      Say 15, "The officer pockets the credits and looks away.", 15
      Msg "A $" + Fmt$(bribe) + " bribe saved your contraband.", 15
    ELSE
      IF k$ = "B" THEN
        cash = cash - bribe
        Say 15, "The officer is offended. Bribe LOST.", 4
      END IF
      fine = MIN(cash, fine)
      cash = cash - fine
      Say 14, "Contraband confiscated. Fined $" + Fmt$(fine) + ".", 4
      Msg "Customs seized " + Fmt$(cargo(6)) + " contraband and fined you $" + Fmt$(fine) + ".", 4
      cargo(6) = 0: cost(6) = 0
      SOUND 100, 5
    END IF
  END IF
  EncounterEnd
END SUB

SUB Derelict
  DrawSpace 3
  Say 10, "A derelict hulk drifts ahead, dark and silent.", 11
  Say 11, "Its cargo bay doors hang open.", 10
  Say 17, "S Salvage it   L Leave it", 7
  DO
    k$ = GetKey$
  LOOP UNTIL k$ = "S" OR k$ = "L"
  IF k$ = "S" THEN
    r = RND
    IF r < 0.5 THEN
      g = INT(RND * 6)
      free = holds - Used
      q = MIN(free, 3 + INT(RND * 8))
      IF q > 0 THEN
        cost(g) = cost(g) * cargo(g) / (cargo(g) + q)
        cargo(g) = cargo(g) + q
        Say 13, "Crates intact! You haul out " + Fmt$(q) + " " + gname$(g) + ".", 15
        Msg "Salvaged " + Fmt$(q) + " free " + gname$(g) + " from a hulk.", 15
        Chime 2
      ELSE
        Say 13, "Crates of " + LCASE$(gname$(g)) + ", but your holds are full!", 10
        Msg "A derelict's cargo was lost: no room.", 10
      END IF
    ELSEIF r < 0.78 THEN
      v = 100 + INT(RND * 400)
      cash = cash + v
      Say 13, "A sealed strongbox! Inside: $" + Fmt$(v) + ".", 15
      Msg "A derelict's strongbox held $" + Fmt$(v) + ".", 15
      Chime 2
    ELSE
      lost = MIN(fuel, 5)
      fuel = fuel - lost
      Say 13, "BOOM. A rigged valve vents " + Fmt$(lost) + " fuel into space.", 4
      Msg "A booby-trapped hulk cost you " + Fmt$(lost) + " fuel.", 4
      SOUND 80, 5
    END IF
  ELSE
    Say 13, "You leave the dead ship to its silence.", 10
    Msg "You passed a derelict hulk and left it alone.", 8
  END IF
  EncounterEnd
END SUB

SUB Stranded
  DrawSpace 4
  pay = 200 + INT(RND * 200)
  amt = 6
  Say 10, "A stranded trader waves you down, tanks dry.", 6
  Say 11, "'Spare " + Fmt$(amt) + " fuel? I'll pay $" + Fmt$(pay) + " on the spot!'", 10
  IF fuel < amt + 4 THEN
    Say 13, "You're running too low yourself. Sorry, friend.", 10
    Msg "A stranded trader needed fuel you couldn't spare.", 8
  ELSE
    Say 17, "Y Help them   N Fly on", 7
    DO
      k$ = GetKey$
    LOOP UNTIL k$ = "Y" OR k$ = "N"
    IF k$ = "Y" THEN
      fuel = fuel - amt
      cash = cash + pay
      Say 13, "They top up and pay $" + Fmt$(pay) + ". A good deed, paid.", 15
      Msg "You sold a stranded trader " + Fmt$(amt) + " fuel for $" + Fmt$(pay) + ".", 15
      Chime 2
    ELSE
      Say 13, "You fly on. Their radio crackles into the dark.", 10
      Msg "You left a stranded trader behind.", 8
    END IF
  END IF
  EncounterEnd
END SUB

' ---------------------------------------------------- saving
FUNCTION HasSave
  HasSave = 0
  OPEN savePath$ FOR APPEND AS #1
  CLOSE #1
  OPEN savePath$ FOR INPUT AS #1
  IF NOT EOF(1) THEN
    LINE INPUT #1, h$
    IF h$ = "TRADER1" THEN HasSave = -1
  END IF
  CLOSE #1
END FUNCTION

SUB WriteNum (v)
  PRINT #1, Fmt$(v)
END SUB

SUB SaveGame
  OPEN savePath$ FOR OUTPUT AS #1
  PRINT #1, "TRADER1"
  WriteNum today: WriteNum here
  WriteNum cash: WriteNum debt
  WriteNum holds: WriteNum fuel
  FOR g = 0 TO 6
    WriteNum cargo(g): WriteNum INT(cost(g) + 0.5)
  NEXT g
  FOR p = 0 TO 6
    FOR g = 0 TO 6
      WriteNum drift(p, g): WriteNum shock(p, g)
    NEXT g
  NEXT p
  CLOSE #1
END SUB

' mark the save as empty (the run is over)
SUB ClearSave
  OPEN savePath$ FOR OUTPUT AS #1
  PRINT #1, "NONE"
  CLOSE #1
END SUB

FUNCTION ReadNum
  IF EOF(1) THEN
    ReadNum = 0
  ELSE
    LINE INPUT #1, l$
    ReadNum = VAL(l$)
  END IF
END FUNCTION

SUB LoadGame
  OPEN savePath$ FOR INPUT AS #1
  LINE INPUT #1, h$
  today = ReadNum: here = ReadNum
  cash = ReadNum: debt = ReadNum
  holds = ReadNum: fuel = ReadNum
  FOR g = 0 TO 6
    cargo(g) = ReadNum: cost(g) = ReadNum
  NEXT g
  FOR p = 0 TO 6
    FOR g = 0 TO 6
      drift(p, g) = ReadNum: shock(p, g) = ReadNum
    NEXT g
  NEXT p
  CLOSE #1
  FOR i = 1 TO 3: ml$(i) = "": mc(i) = 9: NEXT i
  logOn = 1
  Msg "Welcome back, hauler. Game restored.", 7
END SUB

' ---------------------------------------------------- high scores
SUB LoadHi
  FOR i = 1 TO 5
    hsName$(i) = "": hsScore(i) = 0
  NEXT i
  OPEN hiPath$ FOR APPEND AS #1
  CLOSE #1
  OPEN hiPath$ FOR INPUT AS #1
  i = 1
  WHILE i <= 5 AND NOT EOF(1)
    LINE INPUT #1, hsName$(i)
    IF EOF(1) THEN
      hsName$(i) = ""
    ELSE
      LINE INPUT #1, s$
      hsScore(i) = VAL(s$)
      i = i + 1
    END IF
  WEND
  CLOSE #1
END SUB

SUB SaveHi
  OPEN hiPath$ FOR OUTPUT AS #1
  FOR i = 1 TO 5
    IF hsName$(i) <> "" THEN
      PRINT #1, hsName$(i)
      PRINT #1, Fmt$(hsScore(i))
    END IF
  NEXT i
  CLOSE #1
END SUB

' returns the table slot this score earns, or 0
FUNCTION HiSlot (s)
  HiSlot = 0
  FOR i = 5 TO 1 STEP -1
    IF hsName$(i) = "" OR s > hsScore(i) THEN HiSlot = i
  NEXT i
END FUNCTION

SUB AddHi (s, n$)
  slot = HiSlot(s)
  IF slot = 0 THEN EXIT SUB
  FOR i = 5 TO slot + 1 STEP -1
    hsName$(i) = hsName$(i - 1): hsScore(i) = hsScore(i - 1)
  NEXT i
  hsName$(slot) = n$: hsScore(slot) = s
  SaveHi
END SUB

SUB ShowHi (row, mark)
  COLOR 7, 0
  GPRINT 106, row * 10 - 8, "HALL OF FAME", 7, 2
  FOR i = 1 TO 5
    LOCATE row + 1 + i, 12
    IF i = mark THEN COLOR 8, 0 ELSE COLOR 9, 0
    IF hsName$(i) = "" THEN
      PRINT LTRIM$(STR$(i)); ". "; "---";
    ELSE
      PRINT LTRIM$(STR$(i)); ". "; LJ$(hsName$(i), 16); RJ$(hsScore(i), 8);
    END IF
  NEXT i
END SUB

' ---------------------------------------------------- title and ending
SUB DrawPlanet (cx, cy)
  ' back half of the ring, then the planet, then the front half
  FOR a = 3.1416 TO 6.283 STEP 0.05
    PSET (cx + COS(a) * 52, cy + SIN(a) * 9), 10
    PSET (cx + COS(a) * 56, cy + SIN(a) * 11), 12
  NEXT a
  CIRCLE (cx, cy), 34, 5
  PAINT (cx, cy), 5, 5
  CIRCLE (cx, cy), 26, 6
  PAINT (cx, cy), 6, 6
  CIRCLE (cx - 6, cy - 6), 14, 7
  PAINT (cx - 6, cy - 6), 7, 7
  FOR a = 0 TO 3.1416 STEP 0.05
    PSET (cx + COS(a) * 52, cy + SIN(a) * 9), 10
    PSET (cx + COS(a) * 56, cy + SIN(a) * 11), 12
  NEXT a
END SUB

SUB DrawTitle (have)
  COLOR 9, 0
  CLS
  DrawStars
  DrawPlanet 250, 150
  DrawShip 235, 95, 10, 1
  GPRINT 22, 16, "ORBIT TRADER", 2, 4
  GPRINT 21, 15, "ORBIT TRADER", 7, 4
  COLOR 12, 0
  LOCATE 7, 6: PRINT "Buy low. Jump far. Sell high. Dodge pirates.";
  LOCATE 8, 6: PRINT "30 days, a small ship, and a loan to repay.";
  COLOR 7, 0
  LOCATE 11, 6: PRINT "N";
  COLOR 9, 0: PRINT "  New game";
  IF have <> 0 THEN
    COLOR 7, 0: LOCATE 12, 6: PRINT "C";
    COLOR 9, 0: PRINT "  Continue your saved game";
  END IF
  COLOR 7, 0: LOCATE 13, 6: PRINT "H";
  COLOR 9, 0: PRINT "  Hall of fame";
  COLOR 7, 0: LOCATE 14, 6: PRINT "Q";
  COLOR 9, 0: PRINT "  Quit";
  COLOR 10, 0
  LOCATE 17, 3: PRINT "B buy  S sell  J jump  R refuel  X retire  Q quit";
END SUB

' returns 0 quit, 1 new game, 2 continue
FUNCTION TitleScreen
  have = HasSave
  DrawTitle have
  DO
    ' twinkle a star or two
    i = INT(RND * 60)
    IF sy(i) < 100 THEN PSET (sx(i), sy(i)), 8 + INT(RND * 3) * 2 - (RND < 0.5) * 4
    k$ = UCASE$(INKEY$)
    SLEEP 0.06
    IF k$ = "H" THEN
      COLOR 9, 0
      CLS
      DrawStars
      ShowHi 5, 0
      COLOR 10, 0
      LOCATE 18, 14: PRINT "[press a key]";
      k$ = GetKey$
      DrawTitle have
      k$ = ""
    END IF
  LOOP UNTIL k$ = "N" OR k$ = "Q" OR k$ = CHR$(27) OR (k$ = "C" AND have <> 0) OR k$ = CHR$(13)
  TitleScreen = 0
  IF k$ = "N" THEN TitleScreen = 1
  IF k$ = "C" THEN TitleScreen = 2
  IF k$ = CHR$(13) THEN
    IF have <> 0 THEN TitleScreen = 2 ELSE TitleScreen = 1
  END IF
END FUNCTION

FUNCTION RankTitle$ (n)
  IF n < 0 THEN
    RankTitle$ = "Space Bum"
  ELSEIF n < 2000 THEN
    RankTitle$ = "Dock Rat"
  ELSEIF n < 5000 THEN
    RankTitle$ = "Jump Jockey"
  ELSEIF n < 10000 THEN
    RankTitle$ = "Free Hauler"
  ELSEIF n < 18000 THEN
    RankTitle$ = "Lane Runner"
  ELSEIF n < 28000 THEN
    RankTitle$ = "Route Baron"
  ELSEIF n < 40000 THEN
    RankTitle$ = "Guild Master"
  ELSE
    RankTitle$ = "Sovereign of the Sunward Lanes"
  END IF
END FUNCTION

FUNCTION RankLine$ (n)
  IF n < 0 THEN
    RankLine$ = "The bank wants a word. Several, actually."
  ELSEIF n < 2000 THEN
    RankLine$ = "You can still afford the bunk. Barely."
  ELSEIF n < 5000 THEN
    RankLine$ = "Honest work, honest dust on your boots."
  ELSEIF n < 10000 THEN
    RankLine$ = "A ship, a name, and a few friends in port."
  ELSEIF n < 18000 THEN
    RankLine$ = "Dockmasters wave when they see your hull."
  ELSEIF n < 28000 THEN
    RankLine$ = "Whole fleets haul to your timetable."
  ELSEIF n < 40000 THEN
    RankLine$ = "The Guild hangs your portrait in the hall."
  ELSE
    RankLine$ = "They name a comet after you. It's a nice one."
  END IF
END FUNCTION

' cash out and show the retirement screen
SUB Retire
  ' unsold cargo is auctioned dockside at 80%
  auction = 0
  FOR g = 0 TO 6
    auction = auction + INT(cargo(g) * Price(here, g) * 0.8)
  NEXT g
  cash = cash + auction
  net = cash - debt
  COLOR 9, 0
  CLS
  DrawStars
  GPRINT 78, 6, "RETIREMENT", 2, 3
  GPRINT 77, 5, "RETIREMENT", 7, 3
  COLOR 9, 0
  LOCATE 6, 10: PRINT "Day "; Fmt$(today); " at "; pname$(here);
  LOCATE 8, 10: PRINT "Credits";
  LOCATE 8, 34: PRINT RJ$(cash - auction, 9);
  LOCATE 9, 10: PRINT "Cargo auctioned (80%)";
  LOCATE 9, 34: PRINT RJ$(auction, 9);
  LOCATE 10, 10: PRINT "Owed to the Ring Bank";
  COLOR 6, 0: LOCATE 10, 34: PRINT RJ$(-debt, 9);
  COLOR 8, 0
  LOCATE 11, 10: PRINT STRING$(33, "-");
  LOCATE 12, 10: PRINT "NET WORTH";
  LOCATE 12, 34
  IF net < 0 THEN COLOR 4, 0 ELSE COLOR 15, 0
  PRINT RJ$(net, 9);
  tt$ = RankTitle$(net)
  GPRINT 160 - LEN(tt$) * 6, 138, tt$, 7, 2
  COLOR 12, 0
  LOCATE 17, 7: PRINT RankLine$(net);
  Chime 5
  COLOR 10, 0
  LOCATE 19, 14: PRINT "[press a key]";
  k$ = GetKey$
  ClearSave
  slot = HiSlot(net)
  IF slot > 0 THEN
    COLOR 9, 0
    CLS
    DrawStars
    GPRINT 61, 16, "NEW HIGH SCORE!", 2, 3
    GPRINT 60, 15, "NEW HIGH SCORE!", 8, 3
    COLOR 9, 0
    LOCATE 8, 8: PRINT "You made the hall of fame. Your name?";
    LOCATE 10, 8
    LINE INPUT "> ", n$
    n$ = LEFT$(TRIM$(n$), 16)
    IF n$ = "" THEN n$ = "Anonymous"
    AddHi net, n$
    slot = 0
    COLOR 9, 0
    CLS
    DrawStars
    FOR i = 1 TO 5
      IF hsName$(i) = n$ AND hsScore(i) = net THEN slot = i
    NEXT i
  ELSE
    COLOR 9, 0
    CLS
    DrawStars
  END IF
  ShowHi 5, slot
  COLOR 10, 0
  LOCATE 18, 14: PRINT "[press a key]";
  k$ = GetKey$
END SUB
