REM ===================================================
REM  ADVENTUR.BAS - THE GHOST IN THE MACHINE
REM  A text adventure set inside the computer itself.
REM  You are a stray electron. Wake the Clock, find some
REM  colour, and get yourself seen.
REM
REM  Type commands: GO NORTH (or N), LOOK, EXAMINE X, TAKE X,
REM  DROP X, INVENTORY (I), USE X ON Y, GIVE X TO Y, OPEN X,
REM  READ X, TALK TO X, WAIT, SCORE, HELP, SAVE, LOAD, QUIT
REM ===================================================
DIM SHARED rn$(17), rd$(17), ex(17, 6), dn$(6)
DIM SHARED os$(21), oa$(21), od$(21), oloc(21), oloc0(21), otk(21)
DIM SHARED fl(20), preps$(8)
DIM SHARED here, score, moves, over
CONST WRAPW = 52
CONST NROOM = 17
CONST NOBJ = 21
CONST SAVEFILE = "/Documents/ADVENTUR.SAV"
' object numbers (the order of the object DATA below)
CONST iMemo = 1, iCard = 2, iMusic = 3, iFork = 4, iCookie = 5, iWire = 6
CONST iSpark = 7, iStamp = 8, iPaint = 9, iCapac = 10, iPile = 11
CONST iGremlin = 12, iStone = 13, iKeypad = 14, iCrystal = 15
CONST iLibrarian = 16, iConductor = 17, iClerk = 18, iVDoor = 19
CONST iKeeper = 20, iPlatter = 21, iMe = 99
' story flags (fl array)
CONST fGremlin = 1, fMemo = 2, fCard = 3, fFork = 4, fVault = 5, fWire = 6
CONST fSpark = 7, fInSpark = 8, fInFork = 9, fInStamp = 10, fTick = 11
CONST fPainted = 12, fWon = 13

RANDOMIZE TIMER
LoadWorld
DO
  IF NOT Title THEN EXIT DO
  InitGame
  Describe
  DO WHILE over = 0
    DoTurn
  LOOP
  IF over = 2 THEN EXIT DO
  Ending
  IF NOT AskAgain THEN EXIT DO
LOOP
COLOR 9, 0
CLS
PRINT "The machine hums on. Goodnight."
END

' ---------------------------------------------------- world data
' rooms: name, description, exits N E S W U D (0 = none)
DATA "Power Supply"
DATA "A warm, humming cavern of copper coils and fat transformers. The air smells of toasted dust and happy electrons, and everything vibrates at a comfortable sixty hertz, like a very large cat. A cool draught blows from the north."
DATA 3,4,0,2,0,0
DATA "Capacitor Hall"
DATA "A vaulted blue hall, round as a lake and brimming to its rim with stored charge. Little sparks skate across the surface like water boatmen. The air crackles. Everything here is quietly holding its breath."
DATA 0,1,0,0,0,0
DATA "Heat Sink"
DATA "A cold canyon of aluminium fins, each tall as a skyscraper, ticking softly as they cool. A fan far above whirrs like a patient helicopter. After the Power Supply it feels like the shady side of a mountain."
DATA 0,0,1,0,0,0
DATA "Main Bus"
DATA "The Bus: a wide, endlessly busy highway, eight lanes of bits streaming past in tidy convoys. Zeros hurry by in black cars and ones in white. Signposts point everywhere, and a spiral stair climbs up into the Interrupt Desk."
DATA 11,13,6,1,15,0
DATA "Clock Crystal"
DATA "A cathedral-quiet chamber of quartz. A single enormous crystal hangs in the middle like a tuning fork frozen mid-note. By rights the air here should shiver thirty-two thousand times a second. It does not. Everything is waiting."
DATA 0,0,13,0,0,0
DATA "Disk Platter"
DATA "A vast, spinning plain of dark glass, turning slowly beneath your feet like the world's biggest record. Silvery tracks run in rings to the horizon. Somewhere a read head swings by overhead with a soft whoosh."
DATA 4,7,0,9,0,0
DATA "Boot Sector"
DATA "Ancient ruins at the very first sector of the disk. Worn pillars of hexadecimal stand in a ring, and a draught whistles through an old jump instruction. No one has visited for years, but someone has kept the moss tidy."
DATA 0,0,0,6,0,0
DATA "Recycle Bin"
DATA "A quiet, misty graveyard of deleted files. Tilted icons stand like gravestones: LETTER.TXT, UNTITLED(7), FINAL_FINAL2.DOC. A cold wind rustles old thumbnails. It is sad and peaceful, in an oddly cosy way."
DATA 0,0,9,0,0,0
DATA "Trash Heap"
DATA "A mountain of unwanted bits: half-written programs, orphaned temp files and expired passwords. It smells of old coffee and stale bytes. A narrow path winds north into the fog of the Recycle Bin."
DATA 8,6,0,0,0,0
DATA "BASIC Library"
DATA "A hushed, cosy library inside the BASIC interpreter. Shelves rise into the gloom, spines labelled PRINT, GOTO, REM and FOR...NEXT (that one has two volumes that keep going round and round). A reading lamp glows."
DATA 0,0,0,15,0,0
DATA "Video Memory"
DATA "An immense gallery lit by a million tiny lamps. Rows of pixels stand to attention in their little frames, each waiting to be told what colour to be. A few at the back are sulking in black. To the north a tall glass door glows faintly: the Frame Gate, and beyond it, the Screen."
DATA 16,17,4,0,0,0
DATA "Sound Chip"
DATA "A glittering concert hall shaped like a square wave. Red velvet seats climb in steps. On the stage three oscillators wait: Square, Triangle and Noise (who is always a bit loud). The air feels expectant and just slightly out of tune."
DATA 13,0,0,0,0,0
DATA "L1 Cache"
DATA "A tiny, very tidy room that remembers everything you did a moment ago. You have barely arrived and already feel you have been here before. A heavy steel door in the east wall has a keypad beside it."
DATA 5,14,12,4,0,0
DATA "ROM Vault"
DATA "A small, cool room whose walls are fixed, unchangeable stone. Everything here is Read Only and quietly proud of it. Nothing has been moved in years, apart from the dust, which is not covered by the warranty."
DATA 0,0,0,13,0,0
DATA "Interrupt Desk"
DATA "A bustling little office with one desk, one bell and a queue of impatient requests: KEYBOARD, MOUSE, TIMER, each shouting to be served first. A staircase spirals down to the Bus, and a door leads east."
DATA 0,10,0,0,0,4
DATA "The Screen"
DATA "You step through the Frame Gate onto the back of the glass. Beyond it is a whole other world: a desk, a cup of tea, a lamp, and a very large face, sleepy, looking about. The glass hums. Nobody has noticed you. You are a small black dot on a black background."
DATA 0,0,11,0,0,0
DATA "Palette Gallery"
DATA "A warm, glowing studio where sixteen colours hang in tall frames: ink and plum, magenta and crimson, orange and sunset yellow, cream, foliage green and the rest of the family. It smells like a sunset."
DATA 0,0,0,11,0,0

' objects: short name, aliases, start room (0 = hidden), carryable, description
DATA "a pale ghost of a file (MEMO.DOC)","MEMO|MEMO.DOC|MEMO DOC|FILE|GHOST|DOCUMENT|DOC|GHOST OF A FILE",8,1
DATA "A faint, flickering file named MEMO.DOC, wringing its corners in distress. It looks perfectly light enough to carry. Try TALK TO MEMO."
DATA "a library card","CARD|LIBRARY CARD|TICKET",0,1
DATA "A stiff cream card. It reads: LIBRARY CARD. Admit one electron to the BASIC Library. Bearer may borrow one (1) listing."
DATA "a dog-eared listing of sheet music","MUSIC|SHEET MUSIC|SHEET|LISTING|SCORE|SONG|TUNE|PAPER",0,1
DATA "A dog-eared printout titled 'LULLABY FOR A SLEEPING MACHINE'. It is a slow, drowsy tune in square-wave notation. Someone has pencilled in the margin: 'Property of the Maestro, Sound Chip. Please return!'"
DATA "a silver tuning fork","FORK|TUNING FORK|TUNER",0,1
DATA "A neat silver tuning fork, stamped A=440. When you flick it, it sings one perfectly true note."
DATA "a warm browser cookie","COOKIE|BROWSER COOKIE|BISCUIT|SNACK",3,1
DATA "A crumbly browser cookie left over from some long-forgotten surf of the web. Still warm, and it smells faintly of chocolate-chip HTML. Someone, somewhere, would be thrilled to have this."
DATA "a length of copper wire","WIRE|COPPER WIRE|COPPER|CABLE",0,1
DATA "A springy length of bare copper wire. Wonderfully conductive. It tingles a little in your hands."
DATA "a bright spark of charge","SPARK|CHARGE|SPARK OF CHARGE|ELECTRICITY",0,1
DATA "A fat, fizzing blue spark of pure charge. Enough power to wake something up. It wriggles to be put to use."
DATA "a rubber date stamp","STAMP|DATE STAMP|RUBBER STAMP|DATE",0,1
DATA "A brass-handled rubber stamp with little wheels. They are set to the machine's very first morning, so it knows exactly WHEN it is, even if nobody else does."
DATA "a tin of sunset-yellow paint","PAINT|TIN|PAINT TIN|YELLOW PAINT|YELLOW|SUNSET YELLOW|COLOUR|COLOR",17,1
DATA "A small tin of glowing sunset-yellow paint. The label says 'Colour Number Seven'. It smells like the end of a very good day."
DATA "a brimming capacitor","CAPACITOR|CAP|POND|LAKE",2,0
DATA "A capacitor the size of a cathedral, packed to bursting with charge and wobbling with it. It would happily give some away if something conductive bridged its two legs. A length of wire, say."
DATA "a pile of rubbish","PILE|RUBBISH|HEAP|JUNK|TRASH|GARBAGE|MOUNTAIN",9,0
DATA "A teetering heap of rubbish. Something long and copper-coloured glints near the bottom of it."
DATA "a hungry gremlin","GREMLIN|GOBLIN|CREATURE",9,0
DATA "A small, round, green gremlin with big ears and a bigger belly, guarding the path north. He sniffs the air hopefully and rubs his tummy."
DATA "a carved stone tablet","STONE|TABLET|STONE TABLET|CARVING|INSCRIPTION|TEXT",7,0
DATA "Deeply carved into the stone: 'HERE THE MACHINE FIRST AWOKE. THE YEAR OF FIRST LIGHT WAS 1994. LET THE ONE WHO REMEMBERS THE YEAR OPEN WHAT IS KEPT.'"
DATA "a four-digit keypad","KEYPAD|KEYS|BUTTONS|PAD",13,0
DATA "Four big friendly buttons and a tiny label: 'PLEASE ENTER THE YEAR OF FIRST LIGHT.' You could TYPE the digits, like TYPE 1234."
DATA "the sleeping clock crystal","CRYSTAL|CLOCK|CLOCK CRYSTAL|QUARTZ",5,0
DATA "A great sleeping crystal, stuck at the exact moment it stopped. To tick again, it needs three things: POWER (a spark of charge), a true NOTE (to be tuned) and the DATE (to know when it is)."
DATA "a stern librarian","LIBRARIAN|WOMAN|LADY|INTERPRETER",10,0
DATA "The Interpreter's head librarian. Round spectacles, tidy bun, and a way of processing every sentence one line at a time. A sign on her desk reads: BOOKS LENT TO CARD HOLDERS ONLY."
DATA "a drooping conductor","CONDUCTOR|MAESTRO|SQUARE WAVE|BATON|MAN",12,0
DATA "A tall, thin square wave in a tuxedo, baton drooping, looking desperately upset. Behind him the orchestra waits, bows raised, going slowly out of tune."
DATA "a harried clerk","CLERK|HARRIED CLERK|DESK|TELEPHONES",15,0
DATA "A clerk with seven telephones and one bell, mid-sentence in six conversations at once. He keeps being interrupted, even while he is thinking about being interrupted."
DATA "a heavy vault door","DOOR|VAULT|VAULT DOOR|STEEL DOOR|ROM VAULT",13,0
DATA "A heavy steel door stamped ROM VAULT. READ ONLY. PLEASE NO TOUCHING. The keypad beside it is clearly the key."
DATA "the Palette Keeper","KEEPER|PALETTE KEEPER|PAINTER|ARTIST",17,0
DATA "A cheerful keeper in a paint-spattered smock, with a pencil behind each ear. She hums while mixing colours the way other people hum while making tea."
DATA "the spinning platter","PLATTER|DISK|GROOVE|TRACK|TRACK ZERO|PLAIN|RECORD",6,0
DATA "Ring after ring of tracks, each one holding somebody's memories. Near the middle, at track zero, is a snug, empty groove in the shape of a small document. Whatever lived there is long gone."

' ---------------------------------------------------- setup
SUB LoadWorld
  FOR i = 1 TO NROOM
    READ rn$(i), rd$(i)
    FOR d = 1 TO 6: READ ex(i, d): NEXT d
  NEXT i
  FOR i = 1 TO NOBJ
    READ os$(i), oa$(i), oloc0(i), otk(i), od$(i)
  NEXT i
  dn$(1) = "North": dn$(2) = "East": dn$(3) = "South"
  dn$(4) = "West": dn$(5) = "Up": dn$(6) = "Down"
  preps$(1) = " ON ": preps$(2) = " IN ": preps$(3) = " INTO "
  preps$(4) = " TO ": preps$(5) = " WITH ": preps$(6) = " AT "
  preps$(7) = " ONTO ": preps$(8) = " ABOUT "
END SUB

SUB InitGame
  FOR i = 1 TO NOBJ: oloc(i) = oloc0(i): NEXT i
  FOR i = 1 TO 20: fl(i) = 0: NEXT i
  here = 1: score = 0: moves = 0: over = 0
END SUB

' ---------------------------------------------------- title and endings
FUNCTION Title
  COLOR 9, 0
  CLS
  FOR i = 1 TO 60
    PSET (INT(RND * 320), INT(RND * 200)), 12 + INT(RND * 3)
  NEXT i
  ' a little glowing electron
  CIRCLE (270, 40), 9, 13
  CIRCLE (270, 40), 5, 14
  PSET (270, 40), 8
  PSET (279, 40), 7
  GPRINT 31, 11, "THE GHOST", 2, 3
  GPRINT 30, 10, "THE GHOST", 7, 3
  GPRINT 43, 40, "IN THE MACHINE", 2, 2
  GPRINT 42, 39, "IN THE MACHINE", 14, 2
  LOCATE 7, 1
  WrapPrint "You are a stray electron: a lone, shivering speck of charge that fell out of a wire in the Power Supply and woke up. The machine around you is silent and strangely still. Somewhere inside it the Clock has stopped, and until it ticks again nobody will ever notice you are here.", 9
  PRINT
  WrapPrint "Find your way through the Bus, the Disk and the Library, wake the Clock, and get yourself seen.", 14
  COLOR 10, 0
  LOCATE 18, 1: PRINT "Type short commands: GO NORTH, TAKE LAMP, USE X ON Y,"
  PRINT "TALK TO X, EXAMINE X, INVENTORY... or HELP for more.";
  COLOR 7, 0
  LOCATE 20, 4: PRINT "Press SPACE to begin     Esc to quit";
  DO
    k$ = INKEY$
    SLEEP 0.05
  LOOP UNTIL k$ = " " OR k$ = CHR$(13) OR k$ = CHR$(27)
  Title = (k$ <> CHR$(27))
END FUNCTION

SUB Ending
  CLS
  PLAY "MB T130 O4 L8 C E G > C < G E C4 P8 E G > C E G L4 > C"
  ' a blinking cursor, in colour
  LINE (146, 58)-(174, 72), 7, BF
  LINE (148, 60)-(172, 70), 8, BF
  GPRINT 86, 8, "HELLO, WORLD", 2, 3
  GPRINT 85, 7, "HELLO, WORLD", 7, 3
  LOCATE 11, 1
  WrapPrint "On the other side of the glass the sleepy face blinks, leans in, and smiles. 'Oh,' says the person, 'there you are.' The Clock ticks in the corner of the taskbar, loud and cheerful. And right where every line begins, a small yellow cursor starts to blink. That is you. You are seen.", 14
  PRINT
  StatusLine
  COLOR 7, 0
  LOCATE 20, 12: PRINT "Press any key";
  DO
    k$ = INKEY$
    SLEEP 0.05
  LOOP UNTIL k$ <> ""
END SUB

SUB StatusLine
  COLOR 10, 0
  PRINT "Final score: "; LTRIM$(STR$(score)); " of 100 in "; LTRIM$(STR$(moves)); " moves."
  COLOR 7, 0
  PRINT "Rank: "; Rank$
END SUB

FUNCTION Rank$
  IF score >= 100 THEN
    Rank$ = "Master of the Machine"
  ELSEIF score >= 80 THEN
    Rank$ = "Senior Systems Spirit"
  ELSEIF score >= 50 THEN
    Rank$ = "Promising Program"
  ELSEIF score >= 20 THEN
    Rank$ = "Curious Electron"
  ELSE
    Rank$ = "Stray Bit"
  END IF
END FUNCTION

FUNCTION AskAgain
  COLOR 7, 0
  LOCATE 20, 1: PRINT SPACE$(52);
  LOCATE 20, 14: PRINT "Play again? (Y/N)";
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "Y" OR k$ = "N" OR k$ = CHR$(27)
  AskAgain = (k$ = "Y")
END FUNCTION

' ---------------------------------------------------- output helpers
' print text word-wrapped to the screen width, in colour clr
SUB WrapPrint (t$, clr)
  COLOR clr, 0
  ln$ = ""
  p = 1
  DO WHILE p <= LEN(t$)
    q = INSTR(p, t$, " ")
    IF q = 0 THEN q = LEN(t$) + 1
    w$ = MID$(t$, p, q - p)
    IF ln$ = "" THEN
      ln$ = w$
    ELSEIF LEN(ln$) + 1 + LEN(w$) > WRAPW THEN
      PRINT ln$
      ln$ = w$
    ELSE
      ln$ = ln$ + " " + w$
    END IF
    p = q + 1
  LOOP
  IF ln$ <> "" THEN PRINT ln$
END SUB

SUB Say (t$)
  WrapPrint t$, 14
END SUB

SUB AddScore (pts)
  score = score + pts
  COLOR 7, 0
  PRINT "  [+" + LTRIM$(STR$(pts)) + " points]"
END SUB

' one-line status bar at the top: room, score, moves
SUB StatusBar
  rr = CSRLIN: cc = POS(0)
  l$ = " " + UCASE$(rn$(here))
  r$ = "Score " + LTRIM$(STR$(score)) + "  Moves " + LTRIM$(STR$(moves)) + " "
  COLOR 0, 10
  LOCATE 1, 1
  PRINT l$ + SPACE$(53 - LEN(l$) - LEN(r$)) + r$;
  COLOR 9, 0
  LOCATE rr, cc
END SUB

' show the current room: name, description, exits, things here
SUB Describe
  CLS
  StatusBar
  LOCATE 2, 1
  COLOR 7, 0
  PRINT rn$(here)
  WrapPrint rd$(here), 9
  RoomExtra
  e$ = ""
  FOR d = 1 TO 6
    IF ex(here, d) > 0 THEN
      IF e$ <> "" THEN e$ = e$ + ", "
      e$ = e$ + UCASE$(dn$(d))
    END IF
  NEXT d
  WrapPrint "Exits: " + e$, 12
  o$ = ""
  FOR i = 1 TO NOBJ
    IF oloc(i) = here THEN
      IF o$ <> "" THEN o$ = o$ + ", "
      o$ = o$ + os$(i)
    END IF
  NEXT i
  IF o$ <> "" THEN WrapPrint "You see: " + o$ + ".", 10
END SUB

' things in a room that change as the story goes on
SUB RoomExtra
  SELECT CASE here
    CASE 5
      IF fl(fTick) THEN
        WrapPrint "The crystal is awake. TICK. TICK. TICK. The whole machine feels it.", 14
      ELSE
        WrapPrint "The crystal is cold and silent. A tag on it reads: NEEDS POWER, A TRUE NOTE AND THE DATE.", 14
      END IF
    CASE 9
      IF fl(fGremlin) THEN WrapPrint "The gremlin snores contentedly on a pile of old newsletters.", 14
    CASE 13
      IF fl(fVault) THEN WrapPrint "The vault door stands open to the east.", 14
    CASE 11
      IF fl(fTick) = 0 THEN WrapPrint "The Frame Gate is sealed. The glass behind it is dark, as if the whole machine were asleep.", 14
    CASE 16
      IF fl(fPainted) THEN
        WrapPrint "You glow a warm sunset yellow, bright as a cursor on a dark screen.", 14
      ELSE
        WrapPrint "You wave, but no one looks. Black on black is no way to be noticed. You need a colour!", 14
      END IF
  END SELECT
END SUB

' ---------------------------------------------------- parsing
FUNCTION Rep$ (s$, a$, b$)
  r$ = s$
  DO
    p = INSTR(r$, a$)
    IF p = 0 THEN EXIT DO
    r$ = LEFT$(r$, p - 1) + b$ + MID$(r$, p + LEN(a$))
    IF INSTR(b$, a$) > 0 THEN EXIT DO
  LOOP
  Rep$ = r$
END FUNCTION

' split "X ON Y" into a$ and b$ at the first little joining word
SUB SplitPrep (r$, a$, b$)
  t$ = " " + r$ + " "
  best = 0: bl = 0
  FOR i = 1 TO 8
    p = INSTR(t$, preps$(i))
    IF p > 0 THEN
      IF best = 0 OR p < best THEN best = p: bl = LEN(preps$(i))
    END IF
  NEXT i
  IF best = 0 THEN
    a$ = TRIM$(r$): b$ = ""
  ELSE
    a$ = TRIM$(LEFT$(t$, best - 1))
    b$ = TRIM$(MID$(t$, best + bl))
  END IF
END SUB

FUNCTION DirIndex (w$)
  DirIndex = 0
  SELECT CASE w$
    CASE "N", "NORTH": DirIndex = 1
    CASE "E", "EAST": DirIndex = 2
    CASE "S", "SOUTH": DirIndex = 3
    CASE "W", "WEST": DirIndex = 4
    CASE "U", "UP": DirIndex = 5
    CASE "D", "DOWN": DirIndex = 6
  END SELECT
END FUNCTION

' find an object by name among things here or carried
FUNCTION FindObj (n$)
  FindObj = 0
  IF n$ = "" THEN EXIT FUNCTION
  IF INSTR("|ME|MYSELF|SELF|YOURSELF|ELECTRON|BIT|", "|" + n$ + "|") > 0 THEN
    FindObj = iMe
    EXIT FUNCTION
  END IF
  FOR i = 1 TO NOBJ
    IF oloc(i) = here OR oloc(i) = -1 THEN
      IF INSTR("|" + oa$(i) + "|", "|" + n$ + "|") > 0 THEN
        FindObj = i
        EXIT FUNCTION
      END IF
    END IF
  NEXT i
END FUNCTION

' ---------------------------------------------------- the turn
SUB DoTurn
  StatusBar
  COLOR 7, 0
  LINE INPUT "> "; raw$
  COLOR 14, 0
  c$ = " " + UCASE$(raw$) + " "
  FOR i = 1 TO 5
    c$ = Rep$(c$, MID$(".,!?;", i, 1), " ")
  NEXT i
  c$ = Rep$(c$, " PICK UP ", " TAKE ")
  c$ = Rep$(c$, " LOOK AT ", " EXAMINE ")
  c$ = Rep$(c$, " LOOK AROUND ", " LOOK ")
  c$ = Rep$(c$, " PUT DOWN ", " DROP ")
  c$ = Rep$(c$, " TALK TO ", " TALK ")
  c$ = Rep$(c$, " TALK WITH ", " TALK ")
  c$ = Rep$(c$, " SPEAK TO ", " TALK ")
  c$ = Rep$(c$, " SPEAK WITH ", " TALK ")
  c$ = Rep$(c$, " THE ", " ")
  c$ = Rep$(c$, " A ", " ")
  c$ = Rep$(c$, " AN ", " ")
  c$ = Rep$(c$, " SOME ", " ")
  c$ = Rep$(c$, " MY ", " ")
  c$ = Rep$(c$, "  ", " ")
  c$ = TRIM$(c$)
  IF c$ = "" THEN
    Say "Beg pardon? Type something, or HELP."
    EXIT SUB
  END IF
  sp = INSTR(c$, " ")
  IF sp = 0 THEN
    verb$ = c$: rest$ = ""
  ELSE
    verb$ = LEFT$(c$, sp - 1): rest$ = TRIM$(MID$(c$, sp + 1))
  END IF
  SplitPrep rest$, n1$, n2$
  counts = -1
  SELECT CASE verb$
    CASE "N", "S", "E", "W", "U", "D", "NORTH", "SOUTH", "EAST", "WEST", "UP", "DOWN"
      DoMove verb$
    CASE "GO", "WALK", "RUN", "MOVE", "HEAD", "CLIMB"
      DoMove rest$
    CASE "LOOK", "L"
      IF rest$ = "" THEN
        Describe
        counts = 0
      ELSE
        DoExamine rest$
      END IF
    CASE "EXAMINE", "X", "INSPECT", "SEARCH", "CHECK", "STUDY"
      DoExamine rest$
    CASE "TAKE", "GET", "GRAB", "CARRY", "STEAL", "COLLECT"
      DoTake rest$
    CASE "DROP", "LEAVE", "DISCARD"
      DoDrop rest$
    CASE "PUT", "PLACE", "INSERT", "APPLY", "USE", "PRESS", "PLUG", "CONNECT"
      IF n2$ = "" AND verb$ = "PRESS" AND VAL(n1$) > 0 THEN
        DoCode n1$
      ELSEIF n2$ = "" AND verb$ = "PUT" THEN
        DoDrop n1$
      ELSE
        DoUse n1$, n2$
      END IF
    CASE "PAINT"
      DoUse "PAINT", "ME"
    CASE "GIVE", "OFFER", "HAND", "FEED", "SHOW"
      IF n2$ = "" AND verb$ = "FEED" THEN
        DoGive "COOKIE", n1$
      ELSE
        DoGive n1$, n2$
      END IF
    CASE "OPEN", "UNLOCK"
      DoOpen rest$
    CASE "READ"
      DoRead rest$
    CASE "TALK", "ASK", "CHAT", "GREET", "SPEAK"
      DoTalk n1$
    CASE "TYPE", "ENTER", "DIAL", "PUNCH", "SAY"
      DoCode rest$
    CASE "WAVE", "JUMP", "DANCE", "SHOUT", "YELL", "HELLO", "HI"
      DoWave
    CASE "WAIT", "Z", "REST"
      DoWait
    CASE "INVENTORY", "I", "INV"
      DoInv
      counts = 0
    CASE "SCORE"
      DoScore
      counts = 0
    CASE "HELP", "?", "HINT"
      DoHelp
      counts = 0
    CASE "SAVE"
      DoSave
      counts = 0
    CASE "LOAD", "RESTORE"
      DoLoad
      counts = 0
    CASE "QUIT", "EXIT", "Q", "BYE"
      DoQuit
      counts = 0
    CASE "EAT", "DRINK", "TASTE", "LICK"
      Say "You are a stray electron. You would much rather take a nice snack to someone hungrier."
    CASE "KICK", "HIT", "ATTACK", "BREAK", "SMASH", "KILL"
      Say "Violence is not the answer. Inside a computer it usually just means a hard reset."
    CASE "XYZZY", "PLUGH"
      Say "A hollow voice says: 'Wrong cave.' Nothing happens, apart from a faint smell of 1970s mainframes."
    CASE "SING", "WHISTLE", "HUM"
      Say "You hum a few bars. The Power Supply hums back, a little flat."
    CASE "SLEEP"
      Say "You can't sleep. You ARE the thing that keeps the machine awake. Well, you will be."
    CASE ELSE
      Say "I don't know how to '" + LCASE$(verb$) + "'. I only understand things like GET LAMP, GO NORTH or USE X ON Y. Type HELP."
      counts = 0
  END SELECT
  IF counts THEN moves = moves + 1
END SUB

SUB DoMove (w$)
  d = DirIndex(w$)
  IF w$ = "" THEN
    Say "Go where? Try GO NORTH, or just N, S, E, W, U or D."
  ELSEIF d = 0 THEN
    Say "I don't know that direction. Try N, S, E, W, U or D."
  ELSEIF ex(here, d) = 0 THEN
    Say "You can't go that way."
  ELSE
    b$ = Blocked$(d)
    IF b$ <> "" THEN
      Say b$
    ELSE
      here = ex(here, d)
      Describe
    END IF
  END IF
END SUB

' returns a message if the way is shut, or "" if it is open
FUNCTION Blocked$ (d)
  Blocked$ = ""
  IF here = 9 AND d = 1 AND fl(fGremlin) = 0 THEN
    Blocked$ = "The gremlin plants himself in the path, arms folded. 'Nobody passes the Gremlin without a snack,' he says."
  END IF
  IF here = 13 AND d = 2 AND fl(fVault) = 0 THEN
    Blocked$ = "The vault door is firmly locked. The keypad beside it wants a four-digit year."
  END IF
  IF here = 11 AND d = 1 AND fl(fTick) = 0 THEN
    Blocked$ = "The Frame Gate is sealed and the glass is dark. The machine is still fast asleep. Perhaps if the Clock ticked again..."
  END IF
END FUNCTION

SUB DoExamine (n$)
  IF n$ = "" THEN
    Say "Examine what? I only understand things like EXAMINE LAMP."
    EXIT SUB
  END IF
  id = FindObj(n$)
  IF id = 0 THEN
    Say "You don't see that here."
  ELSEIF id = iMe THEN
    Say "A small, nervous electron, a speck of black on a black background. You are not much to look at yet, but you have a lot of potential."
  ELSE
    Say od$(id)
    ExamExtra id
  END IF
END SUB

SUB ExamExtra (id)
  SELECT CASE id
    CASE iPile
      IF fl(fWire) = 0 THEN
        fl(fWire) = 1
        oloc(iWire) = here
        WrapPrint "You dig carefully through the junk and pull out a length of copper WIRE, wiping off the coffee stains.", 14
        AddScore 5
      END IF
    CASE iGremlin
      IF fl(fGremlin) THEN
        WrapPrint "He is snoring happily with a smear of chocolate on his chin.", 14
      ELSE
        WrapPrint "His tummy rumbles loudly. He looks like he hasn't had a decent cookie in years.", 14
      END IF
    CASE iCrystal
      n$ = ""
      IF fl(fInSpark) = 0 THEN n$ = n$ + " power"
      IF fl(fInFork) = 0 THEN n$ = n$ + " a true note"
      IF fl(fInStamp) = 0 THEN n$ = n$ + " the date"
      IF fl(fTick) THEN
        WrapPrint "It is ticking away merrily, bright as a bell.", 14
      ELSEIF n$ = "" THEN
        WrapPrint "It trembles. It is on the very edge of a tick.", 14
      ELSE
        WrapPrint "Still missing:" + n$ + ".", 14
      END IF
    CASE iVDoor
      IF fl(fVault) THEN WrapPrint "It stands open.", 14
  END SELECT
END SUB

SUB DoRead (n$)
  id = FindObj(n$)
  IF n$ = "" THEN
    Say "Read what? I only understand things like READ BOOK."
  ELSEIF id = 0 THEN
    Say "You don't see that here."
  ELSEIF id = iStone OR id = iMusic OR id = iCard OR id = iKeypad OR id = iVDoor THEN
    Say od$(id)
  ELSE
    Say "There is nothing to read on that."
  END IF
END SUB

SUB DoTake (n$)
  IF n$ = "" THEN
    Say "Take what? I only understand things like GET LAMP."
    EXIT SUB
  END IF
  IF n$ = "ALL" OR n$ = "EVERYTHING" THEN
    got = 0
    FOR i = 1 TO NOBJ
      IF oloc(i) = here AND otk(i) = 1 THEN
        oloc(i) = -1
        Say "Taken: " + os$(i) + "."
        got = got + 1
      END IF
    NEXT i
    IF got = 0 THEN Say "There is nothing here worth taking."
    EXIT SUB
  END IF
  id = FindObj(n$)
  IF id = 0 THEN
    Say "You don't see that here."
  ELSEIF id = iMe THEN
    Say "You are already holding yourself together, just about."
  ELSEIF oloc(id) = -1 THEN
    Say "You already have that."
  ELSEIF otk(id) = 0 THEN
    IF id = iGremlin THEN
      Say "The gremlin bares his teeth. 'I'm not for sale,' he says."
    ELSE
      Say "You can't take " + os$(id) + ". It is far too big, or far too busy."
    END IF
  ELSE
    oloc(id) = -1
    Say "Taken: " + os$(id) + "."
  END IF
END SUB

SUB DoDrop (n$)
  IF n$ = "" THEN
    Say "Drop what? I only understand things like DROP LAMP."
    EXIT SUB
  END IF
  id = FindObj(n$)
  IF id = 0 OR id = iMe THEN
    Say "You aren't carrying that."
  ELSEIF oloc(id) <> -1 THEN
    Say "You aren't carrying that."
  ELSEIF id = iMemo AND here = 6 THEN
    r = Combine(iMemo, iPlatter)
  ELSE
    oloc(id) = here
    Say "Dropped: " + os$(id) + "."
  END IF
END SUB

SUB DoInv
  o$ = ""
  FOR i = 1 TO NOBJ
    IF oloc(i) = -1 THEN
      IF o$ <> "" THEN o$ = o$ + ", "
      o$ = o$ + os$(i)
    END IF
  NEXT i
  IF o$ = "" THEN
    Say "You are carrying nothing but your own small charge."
  ELSE
    WrapPrint "You are carrying: " + o$ + ".", 10
  END IF
END SUB

SUB DoUse (a$, b$)
  IF a$ = "" THEN
    Say "Use what? Try USE X ON Y."
    EXIT SUB
  END IF
  ia = FindObj(a$)
  IF ia = 0 THEN
    Say "You don't see that here."
    EXIT SUB
  END IF
  IF b$ = "" THEN
    IF ia = iPaint THEN
      r = Combine(iPaint, iMe)
    ELSE
      Say "Use it on what? Try USE X ON Y."
    END IF
    EXIT SUB
  END IF
  ib = FindObj(b$)
  IF ib = 0 THEN
    Say "You don't see that here."
    EXIT SUB
  END IF
  ' allow USE CAPACITOR ON WIRE as well as USE WIRE ON CAPACITOR
  IF ia <> iMe AND oloc(ia) <> -1 AND ib <> iMe AND oloc(ib) = -1 THEN SWAP ia, ib
  IF ia <> iMe AND oloc(ia) <> -1 THEN
    Say "You aren't carrying that. Try using something you hold ON it."
    EXIT SUB
  END IF
  IF Combine(ia, ib) = 0 THEN Say "Nothing happens. That doesn't seem to go together."
END SUB

SUB DoGive (a$, b$)
  IF a$ = "" THEN
    Say "Give what? Try GIVE X TO Y."
    EXIT SUB
  END IF
  ia = FindObj(a$)
  IF ia = 0 THEN
    Say "You don't see that here."
    EXIT SUB
  END IF
  IF ia = iMe OR oloc(ia) <> -1 THEN
    Say "You aren't carrying that."
    EXIT SUB
  END IF
  IF b$ = "" THEN
    Say "Give it to whom? Try GIVE X TO Y."
    EXIT SUB
  END IF
  ib = FindObj(b$)
  IF ib = 0 THEN
    Say "You don't see that here."
  ELSEIF Combine(ia, ib) = 0 THEN
    Say "That doesn't seem to be wanted. Perhaps they need something else."
  END IF
END SUB

' every "A with B" interaction in the game. returns -1 if it did something.
FUNCTION Combine (a, b)
  Combine = -1
  SELECT CASE a * 100 + b
    CASE iMemo * 100 + iPlatter
      oloc(iMemo) = 0
      fl(fMemo) = 1
      oloc(iCard) = -1
      WrapPrint "You carry MEMO.DOC to the empty groove at track zero and lay it down. It slots in with a soft click. 'Home,' it whispers, glowing like a freshly saved document. Then, from somewhere in its folds, it hands you a stiff little card it was using as a bookmark. 'A LIBRARY CARD. I never returned my books. Perhaps you'll do better.' It settles into the platter and begins, very quietly, to spin.", 14
      AddScore 10
    CASE iCookie * 100 + iGremlin
      oloc(iCookie) = 0
      fl(fGremlin) = 1
      WrapPrint "The gremlin's eyes go as round as saucers. He snatches the cookie, swallows it whole and burps a tiny cloud of static. 'Chocolate chip,' he sighs, and waddles off to nap on a pile of old newsletters. The path north is clear.", 14
      AddScore 5
    CASE iCard * 100 + iLibrarian
      oloc(iCard) = 0
      fl(fCard) = 1
      oloc(iMusic) = -1
      WrapPrint "The librarian inspects the card line by line, stamps it with a satisfying CLUNK, and vanishes into the stacks. She returns with a dog-eared listing: sheet music for 'Lullaby for a Sleeping Machine'. 'Nobody ever asks for that one,' she sniffs. 'Due back whenever.'", 14
      AddScore 10
    CASE iMusic * 100 + iConductor
      oloc(iMusic) = 0
      fl(fFork) = 1
      oloc(iFork) = -1
      WrapPrint "He seizes the music with trembling hands. 'My Lullaby!' He raises his baton and for a moment the whole hall sings, soft and golden. Then he presses a small silver tuning fork into your hand. 'A true A, four-forty. Keep it. Everything in the world should be in tune.'", 14
      AddScore 10
    CASE iWire * 100 + iCapac
      IF fl(fSpark) THEN
        WrapPrint "The capacitor has already given you all the charge it can spare for now.", 14
      ELSE
        fl(fSpark) = 1
        oloc(iSpark) = -1
        WrapPrint "You bridge the capacitor's two legs with the wire. ZAP! A fat blue spark leaps off the glass and lands, fizzing, in your arms. The capacitor sighs with relief.", 14
        AddScore 10
      END IF
    CASE iSpark * 100 + iCrystal
      oloc(iSpark) = 0
      fl(fInSpark) = 1
      WrapPrint "You press the spark against the crystal. It drinks it in and glows a deep amber, from the inside out.", 14
      AddScore 5
      CheckClock
    CASE iFork * 100 + iCrystal
      oloc(iFork) = 0
      fl(fInFork) = 1
      WrapPrint "You strike the fork on a facet and hold it up. A single pure note rings out, and the crystal hums back in perfect tune.", 14
      AddScore 5
      CheckClock
    CASE iStamp * 100 + iCrystal
      oloc(iStamp) = 0
      fl(fInStamp) = 1
      WrapPrint "You press the stamp against the crystal. Little numbers race across the quartz and settle: it remembers when it is.", 14
      AddScore 5
      CheckClock
    CASE iPaint * 100 + iMe
      IF fl(fPainted) THEN
        Say "You are already glowing like a sunset."
      ELSE
        oloc(iPaint) = 0
        fl(fPainted) = 1
        WrapPrint "You dip a fingertip into the tin and paint yourself from head to toe. The black washes away, and you blaze up in warm sunset yellow. Hardly anyone could miss you now!", 14
        AddScore 5
      END IF
    CASE ELSE
      Combine = 0
  END SELECT
END FUNCTION

' when power, tune and date are all in, the clock wakes
SUB CheckClock
  IF fl(fInSpark) AND fl(fInFork) AND fl(fInStamp) THEN
    fl(fTick) = 1
    PLAY "MB T200 O5 L16 C P16 C P16 C P16 C"
    WrapPrint "The crystal shudders, brightens and TICKS. Then again: tick, tick, tick, thirty-two thousand times a second. Down the Bus the traffic lights blink on, the fans spin up, and far away, in Video Memory, a tall glass gate swings open with a creak. The machine is awake!", 14
    AddScore 10
  END IF
END SUB

SUB DoOpen (n$)
  id = FindObj(n$)
  IF n$ = "" THEN
    Say "Open what? I only understand things like OPEN DOOR."
  ELSEIF id = 0 THEN
    Say "You don't see that here."
  ELSEIF id = iVDoor OR id = iKeypad THEN
    IF fl(fVault) THEN
      Say "It is already open."
    ELSE
      Say "Locked tight. The keypad beside it wants a four-digit year. Try TYPE 1234."
    END IF
  ELSE
    Say "You can't open that."
  END IF
END SUB

SUB DoCode (n$)
  IF here = 16 THEN
    DoWave
  ELSEIF n$ = "" THEN
    Say "Type what? Try TYPE 1234, or SAY HELLO."
  ELSEIF here <> 13 THEN
    Say "Nobody here seems to listen."
  ELSEIF VAL(n$) <= 0 THEN
    Say "The keypad only understands digits. Try TYPE 1234."
  ELSEIF fl(fVault) THEN
    Say "The vault is already open."
  ELSEIF VAL(n$) = 1994 THEN
    fl(fVault) = 1
    oloc(iStamp) = 14
    SOUND 880, 2
    WrapPrint "The keypad chirps happily and the steel door slides open with a deep CLUNK. A cool draught drifts out from the east.", 14
    AddScore 10
  ELSE
    SOUND 120, 3
    Say "BZZT. The keypad gives a sad little buzz. That is not the year of first light."
  END IF
END SUB

SUB DoTalk (n$)
  IF n$ = "" THEN
    Say "Talk to whom? Try TALK TO CLERK."
    EXIT SUB
  END IF
  id = FindObj(n$)
  IF id = 0 THEN
    Say "You don't see that here."
    EXIT SUB
  END IF
  SELECT CASE id
    CASE iMe
      Say "You mutter to yourself. Good advice: look around, take things, try using them."
    CASE iMemo
      Say "'Oh! You can see me? I was deleted by accident, you know. I used to live on the Disk, track zero, right in the middle. If you'd only carry me home I'd be ever so grateful. I'm very light.'"
    CASE iGremlin
      IF fl(fGremlin) THEN
        Say "'Zzzz... cookie... zzzz...'"
      ELSE
        Say "'Nobody passes the Gremlin without a snack,' he grumbles. 'Not had a decent cookie since the nineties. The warm kind, with chips.'"
      END IF
    CASE iLibrarian
      IF fl(fCard) THEN
        Say "'Shh,' she whispers, not looking up. 'Enjoy the tune.'"
      ELSE
        Say "'Shh. Everything here runs line by line. I lend a listing only to someone with a LIBRARY CARD. Rules are rules, dear.'"
      END IF
    CASE iConductor
      IF fl(fFork) THEN
        Say "'Hush, my friend, the Lullaby begins!' he whispers, tapping his baton."
      ELSE
        Say "'Alas!' he wails. 'I have lost my music, and the orchestra cannot play a note. I think the BASIC Library borrowed it. Bring me the score and I will give you something very fine.'"
      END IF
    CASE iClerk
      Say "'Yes? One moment... hold on... right, yes, you. You look lost.' He listens to a phone. 'My advice:'"
      WrapPrint HintText$, 11
    CASE iKeeper
      Say "'Everything on the Screen needs a colour to be seen,' she says, stirring. 'Black on black? Nobody looks twice. Take my sunset yellow. It's free for any pixel, and for you.'"
    CASE iCrystal
      Say "You whisper to the crystal. It does not answer, but it hums a little, hopefully."
    CASE ELSE
      Say os$(id) + " has nothing to say. Perhaps it is shy."
  END SELECT
END SUB

' the clerk's hint depends on how far along the story is
FUNCTION HintText$
  h$ = ""
  IF fl(fTick) THEN
    IF fl(fPainted) = 0 THEN
      h$ = "The Clock ticks, but you're invisible. You need a colour. Try the Palette Gallery, east of Video Memory."
    ELSE
      h$ = "Go to the Screen, north of Video Memory, and make yourself seen. Try waving."
    END IF
  ELSEIF fl(fInSpark) = 0 THEN
    IF fl(fSpark) = 1 THEN
      h$ = "You have a spark. Put it into the clock crystal, north of the Cache. USE SPARK ON CRYSTAL."
    ELSEIF fl(fWire) = 0 THEN
      h$ = "The Capacitor Hall, west of the Power Supply, is full of charge, but you need something to tap it with. The Trash Heap is full of lost bits. Try examining the pile."
    ELSE
      h$ = "A length of wire is just the thing to tap a capacitor. USE WIRE ON CAPACITOR."
    END IF
  ELSEIF fl(fInFork) = 0 THEN
    IF oloc(iFork) = -1 THEN
      h$ = "The tuning fork belongs in the clock crystal. USE FORK ON CRYSTAL."
    ELSEIF fl(fMemo) = 0 THEN
      IF fl(fGremlin) = 0 THEN
        h$ = "The gremlin in the Trash Heap will let you by for a cookie. Try the Heat Sink, north of the Power Supply."
      ELSE
        h$ = "The ghost file in the Recycle Bin wants to go home, to track zero on the Disk Platter. Carry it there and drop it."
      END IF
    ELSEIF fl(fCard) = 0 THEN
      h$ = "That library card is for the librarian, east of the Interrupt Desk. GIVE CARD TO LIBRARIAN."
    ELSE
      h$ = "The Maestro in the Sound Chip misses his music. Take the sheet music to him."
    END IF
  ELSEIF fl(fInStamp) = 0 THEN
    IF fl(fVault) = 0 THEN
      h$ = "The ROM Vault is east of the Cache. Its keypad wants a year. The old stone in the Boot Sector remembers it."
    ELSE
      h$ = "Fetch the date stamp from the ROM Vault, and USE STAMP ON CRYSTAL."
    END IF
  END IF
  HintText$ = h$
END FUNCTION

SUB DoWave
  IF here <> 16 THEN
    Say "You wave at nothing in particular. A passing bit waves back, politely."
  ELSEIF fl(fPainted) = 0 THEN
    Say "You jump up and down and wave both arms, but you are a black dot on a black screen. The person sips tea and does not notice. You need a colour!"
  ELSE
    fl(fWon) = 1
    AddScore 10
    over = 1
  END IF
END SUB

SUB DoWait
  SELECT CASE moves MOD 4
    CASE 0: Say "You wait. Somewhere a fan spins up, thinks better of it, and spins down."
    CASE 1: Say "Time passes. At least, you think it does. Nothing here is keeping count."
    CASE 2: Say "You wait. A small packet hurries by, late for something."
    CASE ELSE: Say "You wait quietly and listen to the machine breathe."
  END SELECT
END SUB

SUB DoScore
  Say "You have scored " + LTRIM$(STR$(score)) + " of 100 points in " + LTRIM$(STR$(moves)) + " moves."
  Say "Rank: " + Rank$
END SUB

SUB DoHelp
  WrapPrint "You are a stray electron. Wake the Clock and get yourself seen. Commands:", 9
  WrapPrint "N S E W U D (or GO NORTH), LOOK, EXAMINE X, TAKE X (or TAKE ALL), DROP X, INVENTORY (I), USE X ON Y, PUT X IN Y, GIVE X TO Y, OPEN X, READ X, TALK TO X, TYPE 1234, WAVE, WAIT, SCORE, SAVE, LOAD, QUIT.", 10
  WrapPrint "Stuck? Talk to the people you meet. One of them has a good memory for where things are.", 14
END SUB

SUB DoQuit
  COLOR 7, 0
  PRINT "Really quit? (Y/N) ";
  DO
    k$ = UCASE$(INKEY$)
    SLEEP 0.05
  LOOP UNTIL k$ = "Y" OR k$ = "N" OR k$ = CHR$(27)
  PRINT k$
  IF k$ = "Y" THEN over = 2
END SUB

' ---------------------------------------------------- save and load
SUB DoSave
  OPEN SAVEFILE FOR OUTPUT AS #1
  PRINT #1, here
  PRINT #1, score
  PRINT #1, moves
  FOR i = 1 TO 20: PRINT #1, fl(i): NEXT i
  FOR i = 1 TO NOBJ: PRINT #1, oloc(i): NEXT i
  CLOSE #1
  Say "Game saved to " + SAVEFILE + "."
END SUB

SUB DoLoad
  OPEN SAVEFILE FOR APPEND AS #1
  CLOSE #1
  OPEN SAVEFILE FOR INPUT AS #1
  IF EOF(1) THEN
    CLOSE #1
    Say "There is no saved game yet. Type SAVE first."
  ELSE
    INPUT #1, here
    INPUT #1, score
    INPUT #1, moves
    FOR i = 1 TO 20: INPUT #1, fl(i): NEXT i
    FOR i = 1 TO NOBJ: INPUT #1, oloc(i): NEXT i
    CLOSE #1
    Describe
    Say "Game loaded."
  END IF
END SUB

REM ===================================================
REM  SPOILERS BELOW - WALKTHROUGH (51 moves, 100 points)
REM  Commands, in order (one per line):
REM  N, TAKE COOKIE, S, E, S, W            Heat Sink, Bus, Disk, Trash
REM  EXAMINE PILE, TAKE WIRE                finds the wire
REM  GIVE COOKIE TO GREMLIN, N              Recycle Bin
REM  TAKE MEMO, S, E, DROP MEMO             Disk Platter: you get the CARD
REM  E, READ STONE                          Boot Sector: the year is 1994
REM  W, N, U, E, GIVE CARD TO LIBRARIAN    Library: you get the SHEET MUSIC
REM  W, D, E, S, GIVE MUSIC TO CONDUCTOR    Cache, Sound Chip: you get the FORK
REM  N, TYPE 1994, E, TAKE STAMP            Cache keypad, ROM Vault
REM  W, W, W, W, USE WIRE ON CAPACITOR      Capacitor Hall: you get a SPARK
REM  E, E, E, N                             back to the Clock Crystal
REM  USE SPARK ON CRYSTAL, USE FORK ON CRYSTAL, USE STAMP ON CRYSTAL
REM  S, W, N, E, TAKE PAINT, USE PAINT      Palette Gallery
REM  W, N, WAVE                             the Screen: you win
REM ===================================================
