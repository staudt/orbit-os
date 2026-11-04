import type { SeedFile } from '../fs/seed';

/** The built-in screensavers, as Orbit BASIC programs people can open and edit. */
export const SCREENSAVER_SEEDS: SeedFile[] = [
  {
    path: '/Screensavers/BOUNCE.BAS',
    since: 5,
    content: `' BOUNCE.BAS - the Orbit logo bounces around the screen like a DVD player.
'
' Every wall hit changes the ring and text colors. Hit a corner exactly
' and you get a burst of sparks. A few dim stars drift by behind it.
'
' Things to tweak:
'   SPEED_X, SPEED_Y   how fast the logo moves (pixels per second)
'   NSTARS             how many background stars
'   FRAME              seconds per frame (0.03 is about 30 frames/second)
'   SPARKS             how many sparks in a corner burst
'   RingPick()        the list of colors the logo cycles through
'   DrawPlanet         has all the drawing code for the planet
CONST SPEED_X = 38
CONST SPEED_Y = 29
CONST NSTARS = 60
CONST FRAME = 0.03
CONST SPARKS = 24
CONST SPARK_LIFE = 0.9

w = SCREENW
h = SCREENH
RANDOMIZE TIMER

' Pick a logo size that suits the screen.
IF MIN(w, h) >= 300 THEN
  r = 16
  size = 3
ELSE
  r = 10
  size = 2
END IF
textW = 5 * 6 * size
lw = r * 2 + 10 + textW
lh = r * 2 + 6

bx = w * 0.3
by = h * 0.3
vx = SPEED_X
vy = SPEED_Y
ringIdx = 0
sparkT = -100
sparkX = 0
sparkY = 0
t = 0
last = TIMER

DO
  now = TIMER
  dt = FrameTime(last)
  last = now
  t = t + dt

  CLS

  ' slow parallax stars
  FOR i = 0 TO NSTARS - 1
    sx = (i * 97 + INT(t * (4 + (i MOD 3) * 4))) MOD w
    sy = (i * 53) MOD h
    IF i MOD 4 = 0 THEN PSET (sx, sy), 14 ELSE PSET (sx, sy), 13
  NEXT i

  ' move and bounce
  bx = bx + vx * dt
  by = by + vy * dt
  hitX = 0
  hitY = 0
  IF bx < 4 THEN
    bx = 4
    vx = ABS(vx)
    hitX = 1
  END IF
  IF bx + lw > w - 4 THEN
    bx = w - 4 - lw
    vx = -ABS(vx)
    hitX = 1
  END IF
  IF by < 4 THEN
    by = 4
    vy = ABS(vy)
    hitY = 1
  END IF
  IF by + lh > h - 4 THEN
    by = h - 4 - lh
    vy = -ABS(vy)
    hitY = 1
  END IF
  IF hitX OR hitY THEN ringIdx = ringIdx + 1
  IF hitX AND hitY THEN
    sparkT = t
    sparkX = bx + lw / 2
    sparkY = by + lh / 2
  END IF

  ' the logo: planet on the left, text on the right
  x = INT(bx + 0.5)
  y = INT(by + 0.5)
  DrawPlanet x + r + 4, y + r + 3, r, RingPick(ringIdx)
  GPRINT x + r * 2 + 12, y + INT((lh - 7 * size) / 2), "Orbit", RingPick(ringIdx + 2), size

  ' spark burst after a corner hit
  age = t - sparkT
  IF age < SPARK_LIFE THEN
    k = age / SPARK_LIFE
    FOR i = 0 TO SPARKS - 1
      a = i * 6.2831853 / SPARKS
      reach = 0.6 + 0.2 * (i MOD 3)
      px = INT(sparkX + COS(a) * k * 70 * reach)
      py = INT(sparkY + SIN(a) * k * 50 * reach)
      IF k < 0.5 THEN c = 7 ELSE c = 6
      LINE (px, py)-(px + 1, py + 1), c, BF
    NEXT i
  END IF

  SLEEP FRAME
LOOP

' Seconds since the last call, kept between 0 and 0.1 (TIMER wraps at midnight).
FUNCTION FrameTime (last)
  d = TIMER - last
  IF d < 0 THEN d = 0
  IF d > 0.1 THEN d = 0.1
  FrameTime = d
END FUNCTION

FUNCTION RingPick (i)
  SELECT CASE i MOD 6
    CASE 0
      RingPick = 7
    CASE 1
      RingPick = 6
    CASE 2
      RingPick = 4
    CASE 3
      RingPick = 14
    CASE 4
      RingPick = 15
    CASE ELSE
      RingPick = 9
  END SELECT
END FUNCTION

' ---- The Orbit planet: striped sunset body, gaps in the lower half, and a
' ---- tilted ring (back half first, then the body, then the front half).
FUNCTION BandColor (i)
  SELECT CASE i
    CASE 0, 1
      BandColor = 7
    CASE 2, 3
      BandColor = 6
    CASE 4
      BandColor = 5
    CASE 5
      BandColor = 4
    CASE 6
      BandColor = 3
    CASE ELSE
      BandColor = 2
  END SELECT
END FUNCTION

SUB DrawRing (cx, cy, r, col, front)
  tilt = -0.32
  rx = r * 1.75
  ry = r * 0.42
  thick = 1
  IF r >= 10 THEN thick = 2
  steps = MAX(40, INT(rx * 5))
  FOR i = 0 TO steps - 1
    t = i / steps * 6.2831853
    ex = COS(t) * rx
    ey = SIN(t) * ry
    ' the lower half of the ellipse is the near side of the ring
    IF (ey > 0 AND front <> 0) OR (ey <= 0 AND front = 0) THEN
      x = cx + ex * COS(tilt) - ey * SIN(tilt)
      y = cy + ex * SIN(tilt) + ey * COS(tilt)
      FOR k = 0 TO thick - 1
        PSET (INT(x + 0.5), INT(y + 0.5) + k), col
      NEXT k
    END IF
  NEXT i
END SUB

SUB DrawPlanet (cx, cy, r, ringCol)
  DrawRing cx, cy, r, ringCol, 0
  r2 = (r + 0.5) * (r + 0.5)
  FOR dy = -r TO r
    half = INT(SQR(MAX(0, r2 - dy * dy)))
    idx = INT((dy + r) / (2 * r + 1) * 8)
    skip = 0
    IF dy > 0 AND r >= 6 THEN
      period = MAX(3, INT(r / 3 + 0.5))
      gap = MAX(1, INT(dy / r * (period - 1) + 0.5))
      IF (dy MOD period) < gap AND dy > r * 0.2 THEN skip = 1
    END IF
    IF skip = 0 THEN LINE (cx - half, cy + dy)-(cx + half, cy + dy), BandColor(idx)
  NEXT dy
  DrawRing cx, cy, r, ringCol, 1
END SUB
`,
  },
  {
    path: '/Screensavers/FLIGHT.BAS',
    since: 5,
    content: `' FLIGHT.BAS - fly through space toward the Orbit planets.
'
' Stars rush out of the center of the screen as short streaks (the closer
' they get, the brighter they are) and are recycled when they leave the
' screen. Every so often an Orbit planet appears in the distance and grows
' as it approaches - the radius is proportional to 1 / distance.
'
' Things to tweak:
'   NSTARS         how many stars
'   STAR_SPEED     how fast the stars fly by
'   FLYER_SPEED    how fast the planets approach
'   MAXF           most planets on screen at once
'   FRAME          seconds per frame
'   RingPick()    the colors planet rings can have
CONST NSTARS = 140
CONST MAXF = 8
CONST STAR_SPEED = 0.35
CONST FLYER_SPEED = 0.22
CONST FRAME = 0.03

DIM SHARED sx(NSTARS)
DIM SHARED sy(NSTARS)
DIM SHARED sz(NSTARS)
DIM SHARED fx(MAXF)
DIM SHARED fy(MAXF)
DIM SHARED fz(MAXF)
DIM SHARED fr(MAXF)

RANDOMIZE TIMER
w = SCREENW
h = SCREENH
cx = w / 2
cy = h / 2
f = MIN(w, h) * 0.6

' scatter the first stars at all distances
FOR i = 0 TO NSTARS - 1
  NewStar i, 1
NEXT i

nf = 0
nextF = 0.5
last = TIMER

DO
  dt = FrameTime(last)
  last = TIMER
  CLS

  ' ---- stars: draw a streak from where the star was to where it is now
  FOR i = 0 TO NSTARS - 1
    pz = sz(i)
    sz(i) = sz(i) - dt * STAR_SPEED
    IF sz(i) <= 0.02 THEN
      NewStar i, 0
    ELSE
      x0 = cx + (sx(i) / pz) * f * 0.5
      y0 = cy + (sy(i) / pz) * f * 0.5
      x1 = cx + (sx(i) / sz(i)) * f * 0.5
      y1 = cy + (sy(i) / sz(i)) * f * 0.5
      IF x1 < 0 OR y1 < 0 OR x1 >= w OR y1 >= h THEN
        NewStar i, 0
      ELSE
        IF sz(i) < 0.25 THEN
          c = 9
        ELSEIF sz(i) < 0.5 THEN
          c = 14
        ELSE
          c = 13
        END IF
        LINE (INT(x0), INT(y0))-(INT(x1), INT(y1)), c
      END IF
    END IF
  NEXT i

  ' ---- planets: spawn a new one now and then
  nextF = nextF - dt
  IF nextF <= 0 AND nf < MAXF THEN
    fx(nf) = (RND - 0.5) * 1.4
    fy(nf) = (RND - 0.5) * 1.0
    fz(nf) = 1
    fr(nf) = INT(RND * 6)
    nf = nf + 1
    nextF = 1.2 + RND * 1.4
  END IF

  FOR j = 0 TO nf - 1
    fz(j) = fz(j) - dt * FLYER_SPEED
  NEXT j

  ' far ones first, so near ones paint over them
  FOR j = nf - 1 TO 0 STEP -1
    k = 1 / MAX(0.05, fz(j))
    rad = INT(2 + k * 3.2)
    px = INT(cx + fx(j) * f * 0.5 * k * 0.35)
    py = INT(cy + fy(j) * f * 0.5 * k * 0.35)
    IF rad < h THEN DrawPlanet px, py, rad, RingPick(fr(j))
  NEXT j

  ' the oldest planet is the nearest: retire it once we have flown past
  IF nf > 0 THEN
    IF fz(0) <= 0.08 THEN
      FOR j = 1 TO nf - 1
        fx(j - 1) = fx(j)
        fy(j - 1) = fy(j)
        fz(j - 1) = fz(j)
        fr(j - 1) = fr(j)
      NEXT j
      nf = nf - 1
    END IF
  END IF

  SLEEP FRAME
LOOP

' Put star i at a random spot: anywhere in depth, or far away at the center.
SUB NewStar (i, anywhere)
  sx(i) = (RND - 0.5) * 2
  sy(i) = (RND - 0.5) * 2
  IF anywhere <> 0 THEN sz(i) = RND + 0.03 ELSE sz(i) = 1
END SUB

' Seconds since the last call, kept between 0 and 0.1 (TIMER wraps at midnight).
FUNCTION FrameTime (last)
  d = TIMER - last
  IF d < 0 THEN d = 0
  IF d > 0.1 THEN d = 0.1
  FrameTime = d
END FUNCTION

FUNCTION RingPick (i)
  SELECT CASE i MOD 6
    CASE 0
      RingPick = 7
    CASE 1
      RingPick = 6
    CASE 2
      RingPick = 4
    CASE 3
      RingPick = 14
    CASE 4
      RingPick = 15
    CASE ELSE
      RingPick = 9
  END SELECT
END FUNCTION

' ---- The Orbit planet: striped sunset body, gaps in the lower half, and a
' ---- tilted ring (back half first, then the body, then the front half).
FUNCTION BandColor (i)
  SELECT CASE i
    CASE 0, 1
      BandColor = 7
    CASE 2, 3
      BandColor = 6
    CASE 4
      BandColor = 5
    CASE 5
      BandColor = 4
    CASE 6
      BandColor = 3
    CASE ELSE
      BandColor = 2
  END SELECT
END FUNCTION

SUB DrawRing (cx, cy, r, col, front)
  tilt = -0.32
  rx = r * 1.75
  ry = r * 0.42
  thick = 1
  IF r >= 10 THEN thick = 2
  steps = MAX(40, INT(rx * 5))
  FOR i = 0 TO steps - 1
    t = i / steps * 6.2831853
    ex = COS(t) * rx
    ey = SIN(t) * ry
    ' the lower half of the ellipse is the near side of the ring
    IF (ey > 0 AND front <> 0) OR (ey <= 0 AND front = 0) THEN
      x = cx + ex * COS(tilt) - ey * SIN(tilt)
      y = cy + ex * SIN(tilt) + ey * COS(tilt)
      FOR k = 0 TO thick - 1
        PSET (INT(x + 0.5), INT(y + 0.5) + k), col
      NEXT k
    END IF
  NEXT i
END SUB

SUB DrawPlanet (cx, cy, r, ringCol)
  DrawRing cx, cy, r, ringCol, 0
  r2 = (r + 0.5) * (r + 0.5)
  FOR dy = -r TO r
    half = INT(SQR(MAX(0, r2 - dy * dy)))
    idx = INT((dy + r) / (2 * r + 1) * 8)
    skip = 0
    IF dy > 0 AND r >= 6 THEN
      period = MAX(3, INT(r / 3 + 0.5))
      gap = MAX(1, INT(dy / r * (period - 1) + 0.5))
      IF (dy MOD period) < gap AND dy > r * 0.2 THEN skip = 1
    END IF
    IF skip = 0 THEN LINE (cx - half, cy + dy)-(cx + half, cy + dy), BandColor(idx)
  NEXT dy
  DrawRing cx, cy, r, ringCol, 1
END SUB
`,
  },
  {
    path: '/Screensavers/ORBITS.BAS',
    since: 5,
    content: `' ORBITS.BAS - a little solar system.
'
' The Orbit planet is the sun. Four planets circle it on elliptical orbits,
' each at its own speed, leaving trails behind them. Every few frames FADE
' darkens everything one palette step, so old trail pixels die away.
'
' Things to tweak:
'   FADE_EVERY     fade the screen every this many frames (bigger = longer tails)
'   Orbit radii, speeds, colors and sizes are in the DATA lines at the bottom
'   FRAME          seconds per frame
'   SUN_RING       the color of the sun's ring
CONST FADE_EVERY = 3
CONST FRAME = 0.03
CONST SUN_RING = 7

w = SCREENW
h = SCREENH
cx = w / 2
cy = h / 2
base = MIN(w, h) * 0.46
sunR = INT(base * 0.12)
IF sunR < 4 THEN sunR = 4

' read the four planets: orbit size, speed (radians/second), color, disc radius
DIM orad(4)
DIM ospd(4)
DIM ocol(4)
DIM osiz(4)
DIM ox(4)
DIM oy(4)
FOR i = 0 TO 3
  READ rr, ss, cc, zz
  orad(i) = base * rr
  ospd(i) = ss
  ocol(i) = cc
  osiz(i) = INT(zz * MAX(1, base / 110))
NEXT i

' starting positions (so the first trail segment has somewhere to start from)
FOR i = 0 TO 3
  a = i * 1.7
  ox(i) = INT(cx + COS(a) * orad(i) * 1.35)
  oy(i) = INT(cy + SIN(a) * orad(i) * 0.75)
NEXT i

DrawPlanet cx, cy, sunR, SUN_RING
t = 0
frames = 0
last = TIMER

DO
  dt = FrameTime(last)
  last = TIMER
  t = t + dt
  frames = frames + 1

  ' fade the trails now and then; the sun fades too, so repaint it
  IF frames MOD FADE_EVERY = 0 THEN
    FADE
    DrawPlanet cx, cy, sunR, SUN_RING
  END IF

  FOR i = 0 TO 3
    ' each frame draws a fresh disc; FADE dims the older ones into a comet tail
    a = t * ospd(i) + i * 1.7
    nx = INT(cx + COS(a) * orad(i) * 1.35)
    ny = INT(cy + SIN(a) * orad(i) * 0.75)
    r = osiz(i)
    CIRCLE (nx, ny), r, ocol(i)
    IF POINT(nx, ny) <> ocol(i) THEN PAINT (nx, ny), ocol(i), ocol(i)
    ox(i) = nx
    oy(i) = ny
  NEXT i

  SLEEP FRAME
LOOP

' orbit size (fraction of the screen), speed, color, disc radius
DATA 0.28, 0.9, 14, 3
DATA 0.46, 0.55, 15, 4
DATA 0.66, 0.36, 6, 5
DATA 0.9, 0.22, 9, 6

' Seconds since the last call, kept between 0 and 0.1 (TIMER wraps at midnight).
FUNCTION FrameTime (last)
  d = TIMER - last
  IF d < 0 THEN d = 0
  IF d > 0.1 THEN d = 0.1
  FrameTime = d
END FUNCTION

' ---- The Orbit planet: striped sunset body, gaps in the lower half, and a
' ---- tilted ring (back half first, then the body, then the front half).
FUNCTION BandColor (i)
  SELECT CASE i
    CASE 0, 1
      BandColor = 7
    CASE 2, 3
      BandColor = 6
    CASE 4
      BandColor = 5
    CASE 5
      BandColor = 4
    CASE 6
      BandColor = 3
    CASE ELSE
      BandColor = 2
  END SELECT
END FUNCTION

SUB DrawRing (cx, cy, r, col, front)
  tilt = -0.32
  rx = r * 1.75
  ry = r * 0.42
  thick = 1
  IF r >= 10 THEN thick = 2
  steps = MAX(40, INT(rx * 5))
  FOR i = 0 TO steps - 1
    t = i / steps * 6.2831853
    ex = COS(t) * rx
    ey = SIN(t) * ry
    ' the lower half of the ellipse is the near side of the ring
    IF (ey > 0 AND front <> 0) OR (ey <= 0 AND front = 0) THEN
      x = cx + ex * COS(tilt) - ey * SIN(tilt)
      y = cy + ex * SIN(tilt) + ey * COS(tilt)
      FOR k = 0 TO thick - 1
        PSET (INT(x + 0.5), INT(y + 0.5) + k), col
      NEXT k
    END IF
  NEXT i
END SUB

SUB DrawPlanet (cx, cy, r, ringCol)
  DrawRing cx, cy, r, ringCol, 0
  r2 = (r + 0.5) * (r + 0.5)
  FOR dy = -r TO r
    half = INT(SQR(MAX(0, r2 - dy * dy)))
    idx = INT((dy + r) / (2 * r + 1) * 8)
    skip = 0
    IF dy > 0 AND r >= 6 THEN
      period = MAX(3, INT(r / 3 + 0.5))
      gap = MAX(1, INT(dy / r * (period - 1) + 0.5))
      IF (dy MOD period) < gap AND dy > r * 0.2 THEN skip = 1
    END IF
    IF skip = 0 THEN LINE (cx - half, cy + dy)-(cx + half, cy + dy), BandColor(idx)
  NEXT dy
  DrawRing cx, cy, r, ringCol, 1
END SUB
`,
  },
  {
    path: '/Screensavers/RIBBONS.BAS',
    since: 5,
    content: `' RIBBONS.BAS - "Mystify": two ribbons of bouncing polygons.
'
' Each shape is a 4-point polygon whose corners drift around the screen and
' bounce off the edges. We never clear the screen; FADE darkens every pixel
' one palette step, so old lines leave trails that fade away through the
' colors.
'
' Things to tweak:
'   FADE_EVERY     fade every this many frames (bigger = longer trails)
'   MAXSPEED       fastest corner speed in pixels per second
'   COLOR_A/B      the two ribbon colors (see the palette in the Orbit BASIC docs)
'   NSHAPES, NPTS  more shapes or more corners (add colors in ShapeColor)
'   FRAME          seconds per frame
CONST FADE_EVERY = 2
CONST MAXSPEED = 70
CONST COLOR_A = 6
CONST COLOR_B = 14
CONST NSHAPES = 2
CONST NPTS = 4
CONST FRAME = 0.03

w = SCREENW
h = SCREENH
RANDOMIZE TIMER

' point (s, p) is stored at index s * NPTS + p
total = NSHAPES * NPTS
DIM px(total)
DIM py(total)
DIM vx(total)
DIM vy(total)
FOR i = 0 TO total - 1
  px(i) = RND * (w - 1)
  py(i) = RND * (h - 1)
  vx(i) = (RND * 2 - 1) * MAXSPEED
  vy(i) = (RND * 2 - 1) * MAXSPEED * 0.85
  IF ABS(vx(i)) < 20 THEN vx(i) = 30
  IF ABS(vy(i)) < 20 THEN vy(i) = 25
NEXT i

frames = 0
last = TIMER

DO
  dt = FrameTime(last)
  last = TIMER
  frames = frames + 1
  IF frames MOD FADE_EVERY = 0 THEN FADE

  FOR s = 0 TO NSHAPES - 1
    FOR p = 0 TO NPTS - 1
      i = s * NPTS + p
      px(i) = px(i) + vx(i) * dt
      py(i) = py(i) + vy(i) * dt
      IF px(i) < 0 OR px(i) > w - 1 THEN
        vx(i) = -vx(i)
        px(i) = MAX(0, MIN(w - 1, px(i)))
      END IF
      IF py(i) < 0 OR py(i) > h - 1 THEN
        vy(i) = -vy(i)
        py(i) = MAX(0, MIN(h - 1, py(i)))
      END IF
    NEXT p

    ' connect the corners, and the last one back to the first
    col = ShapeColor(s)
    FOR p = 0 TO NPTS - 1
      a = s * NPTS + p
      b = s * NPTS + ((p + 1) MOD NPTS)
      LINE (INT(px(a)), INT(py(a)))-(INT(px(b)), INT(py(b))), col
    NEXT p
  NEXT s

  SLEEP FRAME
LOOP

FUNCTION ShapeColor (s)
  IF s MOD 2 = 0 THEN ShapeColor = COLOR_A ELSE ShapeColor = COLOR_B
END FUNCTION

' Seconds since the last call, kept between 0 and 0.1 (TIMER wraps at midnight).
FUNCTION FrameTime (last)
  d = TIMER - last
  IF d < 0 THEN d = 0
  IF d > 0.1 THEN d = 0.1
  FrameTime = d
END FUNCTION
`,
  },
  {
    path: '/Screensavers/README.TXT',
    since: 5,
    content: `SCREENSAVERS
============
Every .BAS program in this folder is a screensaver. Orbit runs it full
screen, and any mouse movement or key press stops it.

  BOUNCE.BAS   the Orbit logo bounces around, sparks in the corners
  FLIGHT.BAS   fly through space toward the Orbit planets
  ORBITS.BAS   a little solar system with fading trails
  RIBBONS.BAS  Mystify-style ribbons

CHANGE ONE
  Right-click a .BAS file and choose Open With > BASIC Editor, or type
  "edit BOUNCE.BAS" in the Console. The settings you can tweak are CONSTs
  at the top of each program. Press Run to preview it.

MAKE YOUR OWN
  Save a new .BAS file in this folder and it becomes a screensaver.
  Tips:
   * Use SCREENW and SCREENH for the screen size. It is different on every
     display, so never assume 320x200 and do not call SCREEN.
   * Loop forever (DO ... LOOP). The system stops your program for you.
   * Put SLEEP 0.03 at the end of each frame for about 30 frames a second.
   * FADE darkens every pixel one step: use it instead of CLS for trails.
   * Loops over every pixel are slow. Use CLS, LINE ... BF, CIRCLE and
     PAINT for big areas.
   * GPRINT x, y, text$, color, size draws text anywhere on the screen.

CHOOSE ONE
  Open Config and pick it under Saver.
`,
  },
];
