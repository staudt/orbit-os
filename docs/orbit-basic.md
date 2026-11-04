# Orbit BASIC Language Reference

Orbit BASIC is a structured, QBasic-style BASIC. Line numbers are optional. Keywords are case-insensitive, and the editor upper-cases them as you type.

## Program structure
- Statements are separated by new lines or `:`.
- A comment starts with `REM` or `'`.
- Labels: `name:` at the start of a line. A line may also start with a line number (`10 PRINT "HI"`). Both can be the target of `GOTO`/`GOSUB`/`RESTORE`.
- `END`, `STOP` and `SYSTEM` stop the program.

## Values and variables
- Two types: **numbers** (64-bit floats) and **strings**.
- A name ending in `$` is a string variable. All other names are numbers. Suffixes `%`, `&`, `!` and `#` are accepted on numeric names; `%` and `&` truncate toward zero when assigned (`x% = 2.7` gives 2).
- Variables need no declaration and start as `0` or `""`. `DIM x AS INTEGER|LONG|SINGLE|DOUBLE|STRING` is accepted; `AS STRING` makes `x` a string.
- `LET` is optional: `LET a = 1` is the same as `a = 1`.
- `CONST name = expr`.
- Arrays: `DIM a(10)` has indices `0..10`. `DIM grid(3, 4)` makes a 2-D array, and `DIM names$(5)` an array of strings. Using an array that was never DIMmed auto-creates it with upper bound 10. An index outside the bounds gives "Subscript out of range". `DIM a(1 TO 5)` sets explicit bounds. `LBOUND(a)` and `UBOUND(a)` return the bounds (an optional 2nd argument gives the dimension).
- `DIM SHARED x` at the top level makes `x` visible inside SUBs and FUNCTIONs. Otherwise SUB and FUNCTION variables are local. CONSTs are visible everywhere.

## Operators (highest precedence first)
1. `^`
2. unary `-` and `+`
3. `*`, `/`
4. `\` (integer division, both operands rounded first)
5. `MOD` (operands rounded; the result has the sign of the dividend)
6. `+`, `-` (`+` also joins strings)
7. `=`, `<>`, `<`, `>`, `<=`, `>=`. Strings compare lexically. True is `-1` and false is `0`.
8. `NOT` (bitwise on integers)
9. `AND`
10. `OR`, `XOR`

Division by zero is a runtime error, "Division by zero". Mixing strings and numbers in an operator gives "Type mismatch".

## Control flow
```basic
IF x > 5 THEN PRINT "big" ELSE PRINT "small"     ' single-line form
IF x > 5 THEN 100                                 ' THEN line-number = GOTO
IF a = 1 THEN
  ...
ELSEIF a = 2 THEN
  ...
ELSE
  ...
END IF

FOR i = 1 TO 10 STEP 2 ... NEXT i     ' NEXT's variable name is optional; STEP may be negative
WHILE cond ... WEND
DO ... LOOP                          ' also DO WHILE c / DO UNTIL c / LOOP WHILE c / LOOP UNTIL c
SELECT CASE expr
  CASE 1, 2
  CASE 3 TO 5
  CASE IS > 10
  CASE "yes"
  CASE ELSE
END SELECT
GOTO label   GOSUB label ... RETURN
EXIT FOR | EXIT DO | EXIT WHILE | EXIT SUB | EXIT FUNCTION
```
After a FOR loop finishes, the loop variable holds the first value that failed the test, so after `FOR i = 1 TO 3`, `i` is 4. A FOR body whose start is already past the end never runs.

## SUBs and FUNCTIONs
```basic
SUB Greet (who$, times)
  FOR i = 1 TO times: PRINT "Hi "; who$: NEXT
END SUB

FUNCTION Square (n)
  Square = n * n
END FUNCTION

Greet "Ann", 2       ' or: CALL Greet("Ann", 2)
PRINT Square(4)
```
- Arguments that are plain variables or array elements are passed **by reference**, so assigning to the parameter changes the caller's variable. Expressions are passed by value. Wrapping an argument in parentheses, `(x)`, forces by-value.
- A FUNCTION returns whatever was last assigned to its own name, or `0`/`""` if nothing was. FUNCTION names ending in `$` return strings.
- SUBs and FUNCTIONs may be defined anywhere in the file, even after they are used, and may be recursive.
- Execution never "falls into" a SUB body. The main program is everything outside SUB and FUNCTION blocks.

## PRINT formatting (QBasic rules)
- A number prints with a leading space if it is not negative, and is always followed by one trailing space. So `PRINT 5` prints `" 5 "`, `PRINT -3` prints `"-3 "`, and `PRINT "A"; 5` prints `"A 5 "`.
- Number text:
  - Integers with magnitude below 1e15 print as plain digits.
  - Other numbers print with up to 7 significant digits, trailing zeros removed, and no `0` before the decimal point: `PRINT 1/3` prints `" .3333333 "`, and `PRINT 2.5` prints `" 2.5 "`.
  - Very large or very small values use the form `1.234568E+20`.
- `;` puts the next item directly after the previous one. `,` moves to the next 14-column zone (columns 1, 15, 29 and so on). A trailing `;` or `,` suppresses the newline.
- `TAB(n)` moves to column `n` (1-based); if the cursor is already past `n`, it moves to that column on the next line. `SPC(n)` prints `n` spaces.
- `PRINT` alone prints an empty line.
- `STR$(n)` uses the same number text as PRINT, with the leading space for non-negative numbers but **no trailing space**: `STR$(5)` is `" 5"`.

## Input
- `INPUT "Name"; n$` shows `Name? `. `INPUT "Name", n$` shows `Name` with no question mark. `INPUT a, b` reads comma-separated values.
- `LINE INPUT "Prompt: "; l$` reads a whole line, commas included.
- `INKEY$` returns the last key pressed, or `""` if there is none (it does not wait). Special keys come back as `CHR$(0) + code`.

## Built-in functions
- Strings:
  - `LEN(s$)`, `LEFT$(s$, n)`, `RIGHT$(s$, n)`, `MID$(s$, start[, len])`. `MID$(s$, i, n) = x$` as a statement replaces characters in place.
  - `INSTR([start,] s$, find$)` returns 0 when `find$` is not found.
  - `UCASE$`, `LCASE$`, `LTRIM$`, `RTRIM$`, `SPACE$(n)`, `STRING$(n, c$|code)`.
  - `CHR$(n)`, `ASC(s$)`, `VAL(s$)` (reads a leading number and stops at the first character that doesn't fit; `VAL("12ab")` is 12), `STR$(n)`, `HEX$(n)`.
- Math:
  - `ABS`, `SGN`.
  - `INT` (floor), `FIX` (truncate), `CINT` (round half to even).
  - `SQR`, `SIN`, `COS`, `TAN`, `ATN`, `LOG`, `EXP`.
  - `RND` returns a value in `[0,1)`; `RND(0)` repeats the last value. `RANDOMIZE [seed]` seeds the generator, and `RANDOMIZE TIMER` is the usual form.
  - `MIN(a, b)` and `MAX(a, b)` are Orbit extensions.
- Time:
  - `TIMER` is seconds since midnight.
  - `DATE$` is `"MM-DD-YYYY"` and `TIME$` is `"HH:MM:SS"`.
  - `SLEEP [seconds]` waits. With no argument it waits for a key.

## Screen, graphics and color
- Each running program gets a window with a 320×200, 16-color screen. `SCREEN w, h` resizes it, up to 640×400.
- Text uses 6×10-pixel character cells: 53 columns by 20 rows at 320×200. `CLS` clears, `LOCATE row, col` moves the cursor, and `COLOR fg[, bg]` sets colors 0–15. `CSRLIN` and `POS(0)` give the cursor position.
- Graphics:
  - `PSET (x, y)[, c]`, `PRESET (x, y)`.
  - `LINE [(x1, y1)]-(x2, y2)[, c][, B|BF]` (`B` = box, `BF` = filled box).
  - `CIRCLE (x, y), r[, c]`.
  - `PAINT (x, y)[, c[, border]]`.
  - `POINT(x, y)` returns the color at that pixel.
- Orbit extensions:
  - `SCREENW` and `SCREENH` return the screen size in pixels.
  - `FADE` darkens every pixel one step through the palette, for fading trails.
  - `GPRINT x, y, text$[, color[, size]]` draws text at a pixel position with the UI font; `size` 2–8 enlarges it.
- Colors 0–15 are the Orbit palette:

  | | | | |
  |---|---|---|---|
  | 0 ink | 1 dark plum | 2 plum | 3 magenta |
  | 4 crimson | 5 red | 6 orange | 7 yellow |
  | 8 pale | 9 cream | 10 tan | 11 grey |
  | 12 mauve | 13 purple | 14 lavender | 15 green |

  The default text is 9 (cream) on 0 (ink).

## Sound
- `BEEP`.
- `SOUND freq, duration`: duration is in clock ticks, 18.2 per second.
- `PLAY mml$` uses the QBasic music macro language:
  - Notes and rests: `A`–`G` with `#`, `+` or `-`, an optional length and dots; `P` or `R` for a rest; `N` n for a note by number.
  - Settings: `O` octave, `<` and `>` to step it, `L` length, `T` tempo.
  - Articulation: `MN` normal, `ML` legato, `MS` staccato.
  - Orbit extensions: `V` volume 0–15; `WS`, `WT` and `WN` for square, triangle and noise; `;` separates up to 3 simultaneous voices.

## Files (on Orbit HD)
- Relative paths resolve against the folder of the running program, or `/Documents` for an unsaved program.
- `OPEN "notes.txt" FOR INPUT|OUTPUT|APPEND AS #1`.
- Reading and writing: `PRINT #1, ...` (same formatting as PRINT), `INPUT #1, a$`, `LINE INPUT #1, l$`, `EOF(1)`.
- `CLOSE [#1]`. Files are written to disk on CLOSE or when the program ends.
- `KILL f$`, `NAME old$ AS new$`, `MKDIR d$`, and `FILES [dir$]`, which prints a listing.
- Errors: "File not found", "Bad file number", "Input past end of file".

## DATA
`DATA 1, 2, "three"` holds values. `READ a, b, c$` takes them in order, and `RESTORE [label]` starts over. Running past the last value gives "Out of DATA".

## Errors
A runtime error stops the program and reports the message plus the line number in the editor (1-based), for example `Subscript out of range in line 12`. Syntax errors are reported before the program runs, the same way: `Syntax error in line 3: expected THEN`.

Error messages: Syntax error, Type mismatch, Division by zero, Subscript out of range, Out of DATA, RETURN without GOSUB, NEXT without FOR, Label not defined, Illegal function call, File not found, Bad file number, Input past end of file, Duplicate definition, Overflow.

## Window apps (GUI extension)
See the "Window apps" help page. This part arrives in a later milestone: `WINDOW`, `BUTTON`, `LABEL`, `TEXTBOX`, `WAITEVENT`, `MOUSEX`/`MOUSEY`/`MOUSEB`.
