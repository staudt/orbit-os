export interface KeywordHelp {
  /** keyword as written, upper-case, e.g. "PRINT", "LEFT$", "END IF" */
  kw: string;
  /** category for grouping */
  cat: 'Program' | 'Variables' | 'Control' | 'Subs' | 'Text' | 'Input' | 'Strings' | 'Math' | 'Time' | 'Graphics' | 'Sound' | 'Files' | 'Data';
  /** one-line syntax, e.g. 'LEFT$(s$, n)' */
  syntax: string;
  /** short plain-English description, max ~70 characters */
  desc: string;
  /** tiny example (one line, optional) */
  example?: string;
}

export const BASIC_HELP: KeywordHelp[] = [
  { kw: 'FADE', cat: 'Graphics', syntax: 'FADE', desc: 'Darken every pixel one palette step (trail effects)', example: 'FADE' },
  { kw: 'GPRINT', cat: 'Graphics', syntax: 'GPRINT x, y, text$[, color[, size]]', desc: 'Draw text at a pixel position, optionally enlarged', example: 'GPRINT 10, 10, "Hi", 7, 2' },
  { kw: 'SCREENW', cat: 'Graphics', syntax: 'SCREENW', desc: 'Width of the screen in pixels', example: 'cx = SCREENW / 2' },
  { kw: 'SCREENH', cat: 'Graphics', syntax: 'SCREENH', desc: 'Height of the screen in pixels', example: 'cy = SCREENH / 2' },
  // Program
  { kw: '\'', cat: 'Program', syntax: '\'text', desc: 'Comment; the rest of the line is ignored.', example: '\' set up the screen' },
  { kw: 'END', cat: 'Program', syntax: 'END', desc: 'Stops the program.' },
  { kw: 'REM', cat: 'Program', syntax: 'REM text', desc: 'Comment; the rest of the line is ignored.', example: 'REM draw the border' },
  { kw: 'STOP', cat: 'Program', syntax: 'STOP', desc: 'Stops the program.' },
  { kw: 'SYSTEM', cat: 'Program', syntax: 'SYSTEM', desc: 'Stops the program.' },

  // Variables
  { kw: 'CONST', cat: 'Variables', syntax: 'CONST name = expr', desc: 'Declares a named constant, visible everywhere.', example: 'CONST MAXN = 10' },
  { kw: 'DIM', cat: 'Variables', syntax: 'DIM name(n[, m]) [AS type]', desc: 'Declares an array, or a variable with AS type.', example: 'DIM grid(3, 4)' },
  { kw: 'DIM SHARED', cat: 'Variables', syntax: 'DIM SHARED name', desc: 'Top level: makes a variable visible inside SUBs and FUNCTIONs.', example: 'DIM SHARED score' },
  { kw: 'LBOUND', cat: 'Variables', syntax: 'LBOUND(array[, dim])', desc: 'Returns the lower bound of an array.', example: 'PRINT LBOUND(a)' },
  { kw: 'LET', cat: 'Variables', syntax: 'LET var = expr', desc: 'Assigns a value to a variable. LET is optional.', example: 'LET a = 1' },
  { kw: 'UBOUND', cat: 'Variables', syntax: 'UBOUND(array[, dim])', desc: 'Returns the upper bound of an array.', example: 'PRINT UBOUND(a)' },

  // Control
  { kw: 'CASE', cat: 'Control', syntax: 'CASE values | CASE IS op value | CASE ELSE', desc: 'One branch of SELECT CASE: values, ranges or IS tests.', example: 'CASE 3 TO 5' },
  { kw: 'DO', cat: 'Control', syntax: 'DO [WHILE|UNTIL cond]', desc: 'Starts a DO loop; the optional test can go here or at LOOP.', example: 'DO UNTIL done' },
  { kw: 'ELSE', cat: 'Control', syntax: 'ELSE', desc: 'Branch taken when the IF condition is false.', example: 'IF x THEN PRINT 1 ELSE PRINT 0' },
  { kw: 'ELSEIF', cat: 'Control', syntax: 'ELSEIF cond THEN', desc: 'Adds another test to a block IF.', example: 'ELSEIF a = 2 THEN' },
  { kw: 'END IF', cat: 'Control', syntax: 'END IF', desc: 'Ends a block IF.' },
  { kw: 'END SELECT', cat: 'Control', syntax: 'END SELECT', desc: 'Ends a SELECT CASE block.' },
  { kw: 'EXIT DO', cat: 'Control', syntax: 'EXIT DO', desc: 'Leaves the enclosing DO loop.' },
  { kw: 'EXIT FOR', cat: 'Control', syntax: 'EXIT FOR', desc: 'Leaves the enclosing FOR loop.' },
  { kw: 'EXIT WHILE', cat: 'Control', syntax: 'EXIT WHILE', desc: 'Leaves the enclosing WHILE loop.' },
  { kw: 'FOR', cat: 'Control', syntax: 'FOR var = start TO end [STEP n]', desc: 'Starts a counted loop, ended by NEXT.', example: 'FOR i = 1 TO 10 STEP 2' },
  { kw: 'GOSUB', cat: 'Control', syntax: 'GOSUB label', desc: 'Calls a label as a subroutine; RETURN comes back here.', example: 'GOSUB draw' },
  { kw: 'GOTO', cat: 'Control', syntax: 'GOTO label', desc: 'Jumps to a label or line number.', example: 'GOTO 100' },
  { kw: 'IF', cat: 'Control', syntax: 'IF cond THEN ... [ELSE ...]', desc: 'Conditional: single-line form or block form ending in END IF.', example: 'IF x > 5 THEN PRINT "big" ELSE PRINT "small"' },
  { kw: 'LOOP', cat: 'Control', syntax: 'LOOP [WHILE|UNTIL cond]', desc: 'Ends a DO loop; the optional test can go here.' },
  { kw: 'NEXT', cat: 'Control', syntax: 'NEXT [var]', desc: 'Ends a FOR loop and increments its variable.', example: 'NEXT i' },
  { kw: 'RETURN', cat: 'Control', syntax: 'RETURN', desc: 'Returns from a GOSUB.' },
  { kw: 'SELECT CASE', cat: 'Control', syntax: 'SELECT CASE expr', desc: 'Branches on the value of an expression.', example: 'SELECT CASE n' },
  { kw: 'STEP', cat: 'Control', syntax: 'FOR var = a TO b STEP n', desc: 'Sets the FOR loop increment; it may be negative.', example: 'FOR i = 10 TO 1 STEP -1' },
  { kw: 'THEN', cat: 'Control', syntax: 'IF cond THEN stmt | line', desc: 'Starts the true branch; a line number acts as GOTO.', example: 'IF x > 5 THEN 100' },
  { kw: 'TO', cat: 'Control', syntax: 'FOR var = start TO end', desc: 'Sets the end value of a FOR loop or a CASE range.', example: 'CASE 3 TO 5' },
  { kw: 'WEND', cat: 'Control', syntax: 'WEND', desc: 'Ends a WHILE loop.' },
  { kw: 'WHILE', cat: 'Control', syntax: 'WHILE cond', desc: 'Starts a loop that runs while cond is true, ended by WEND.', example: 'WHILE i < 10' },

  // Subs
  { kw: 'CALL', cat: 'Subs', syntax: 'CALL name [(args)]', desc: 'Calls a SUB. The CALL keyword is optional.', example: 'CALL Greet("Ann", 2)' },
  { kw: 'END FUNCTION', cat: 'Subs', syntax: 'END FUNCTION', desc: 'Ends a FUNCTION definition.' },
  { kw: 'END SUB', cat: 'Subs', syntax: 'END SUB', desc: 'Ends a SUB definition.' },
  { kw: 'EXIT FUNCTION', cat: 'Subs', syntax: 'EXIT FUNCTION', desc: 'Leaves the current FUNCTION early.' },
  { kw: 'EXIT SUB', cat: 'Subs', syntax: 'EXIT SUB', desc: 'Leaves the current SUB early.' },
  { kw: 'FUNCTION', cat: 'Subs', syntax: 'FUNCTION name [(params)]', desc: 'Defines a function; assign to its name to set the result.', example: 'FUNCTION Square (n)' },
  { kw: 'SUB', cat: 'Subs', syntax: 'SUB name [(params)]', desc: 'Defines a subroutine, ended by END SUB.', example: 'SUB Greet (who$, times)' },

  // Text
  { kw: 'CLS', cat: 'Text', syntax: 'CLS', desc: 'Clears the screen.' },
  { kw: 'COLOR', cat: 'Text', syntax: 'COLOR fg[, bg]', desc: 'Sets text colors, 0-15.', example: 'COLOR 14, 1' },
  { kw: 'CSRLIN', cat: 'Text', syntax: 'CSRLIN', desc: 'Returns the cursor row.', example: 'PRINT CSRLIN' },
  { kw: 'LOCATE', cat: 'Text', syntax: 'LOCATE row, col', desc: 'Moves the text cursor to a row and column.', example: 'LOCATE 5, 10' },
  { kw: 'POS', cat: 'Text', syntax: 'POS(0)', desc: 'Returns the cursor column.', example: 'PRINT POS(0)' },
  { kw: 'PRINT', cat: 'Text', syntax: 'PRINT [items]', desc: 'Prints text and numbers; ; and , control spacing.', example: 'PRINT "A"; 5' },
  { kw: 'SPC', cat: 'Text', syntax: 'SPC(n)', desc: 'In PRINT, outputs n spaces.', example: 'PRINT "A"; SPC(3); "B"' },
  { kw: 'TAB', cat: 'Text', syntax: 'TAB(n)', desc: 'In PRINT, moves to column n (1-based).', example: 'PRINT TAB(10); "X"' },

  // Input
  { kw: 'INKEY$', cat: 'Input', syntax: 'INKEY$', desc: 'Returns the last key pressed, or "" if none. Does not wait.', example: 'k$ = INKEY$' },
  { kw: 'INPUT', cat: 'Input', syntax: 'INPUT ["prompt"; | ","] vars', desc: 'Reads values typed by the user, with an optional prompt.', example: 'INPUT "Name"; n$' },
  { kw: 'LINE INPUT', cat: 'Input', syntax: 'LINE INPUT ["prompt"; ] var$', desc: 'Reads a whole line of text, commas included.', example: 'LINE INPUT "Say: "; l$' },

  // Strings
  { kw: 'ASC', cat: 'Strings', syntax: 'ASC(s$)', desc: 'Returns the character code of the first character.', example: 'PRINT ASC("A")' },
  { kw: 'CHR$', cat: 'Strings', syntax: 'CHR$(n)', desc: 'Returns the character with code n.', example: 'PRINT CHR$(65)' },
  { kw: 'HEX$', cat: 'Strings', syntax: 'HEX$(n)', desc: 'Returns a number as hexadecimal text.', example: 'PRINT HEX$(255)' },
  { kw: 'INSTR', cat: 'Strings', syntax: 'INSTR([start,] s$, find$)', desc: 'Position of find$ in s$, or 0 if it is not found.', example: 'INSTR("hello", "ll")' },
  { kw: 'LCASE$', cat: 'Strings', syntax: 'LCASE$(s$)', desc: 'Converts a string to lower case.', example: 'LCASE$("ABC")' },
  { kw: 'LEFT$', cat: 'Strings', syntax: 'LEFT$(s$, n)', desc: 'Returns the first n characters of a string.', example: 'LEFT$("HELLO", 2)' },
  { kw: 'LEN', cat: 'Strings', syntax: 'LEN(s$)', desc: 'Returns the number of characters in a string.', example: 'LEN("abc")' },
  { kw: 'LTRIM$', cat: 'Strings', syntax: 'LTRIM$(s$)', desc: 'Removes leading spaces.', example: 'LTRIM$("  a")' },
  { kw: 'MID$', cat: 'Strings', syntax: 'MID$(s$, start[, len])', desc: 'Part of a string; as a statement, replaces characters in place.', example: 'MID$(s$, 2, 3) = "xyz"' },
  { kw: 'RIGHT$', cat: 'Strings', syntax: 'RIGHT$(s$, n)', desc: 'Returns the last n characters of a string.', example: 'RIGHT$("HELLO", 2)' },
  { kw: 'RTRIM$', cat: 'Strings', syntax: 'RTRIM$(s$)', desc: 'Removes trailing spaces.', example: 'RTRIM$("a  ")' },
  { kw: 'SPACE$', cat: 'Strings', syntax: 'SPACE$(n)', desc: 'Returns a string of n spaces.', example: 'SPACE$(4)' },
  { kw: 'STR$', cat: 'Strings', syntax: 'STR$(n)', desc: 'Converts a number to text, the same way PRINT does.', example: 'STR$(5)' },
  { kw: 'STRING$', cat: 'Strings', syntax: 'STRING$(n, c$ | code)', desc: 'Returns n copies of a character given as text or as a code.', example: 'STRING$(5, "-")' },
  { kw: 'UCASE$', cat: 'Strings', syntax: 'UCASE$(s$)', desc: 'Converts a string to upper case.', example: 'UCASE$("abc")' },
  { kw: 'VAL', cat: 'Strings', syntax: 'VAL(s$)', desc: 'Reads the number at the start of a string.', example: 'VAL("12ab")' },

  // Math
  { kw: 'ABS', cat: 'Math', syntax: 'ABS(n)', desc: 'Absolute value of n.', example: 'ABS(-3)' },
  { kw: 'ATN', cat: 'Math', syntax: 'ATN(n)', desc: 'Arctangent of n.' },
  { kw: 'CINT', cat: 'Math', syntax: 'CINT(n)', desc: 'Rounds to the nearest integer; halves go to even.', example: 'CINT(2.5)' },
  { kw: 'COS', cat: 'Math', syntax: 'COS(n)', desc: 'Cosine of n.' },
  { kw: 'EXP', cat: 'Math', syntax: 'EXP(n)', desc: 'e raised to the power n.' },
  { kw: 'FIX', cat: 'Math', syntax: 'FIX(n)', desc: 'Drops the fraction, truncating toward zero.', example: 'FIX(-2.7)' },
  { kw: 'INT', cat: 'Math', syntax: 'INT(n)', desc: 'Largest whole number not above n (floor).', example: 'INT(-2.5)' },
  { kw: 'LOG', cat: 'Math', syntax: 'LOG(n)', desc: 'Natural logarithm of n.' },
  { kw: 'MAX', cat: 'Math', syntax: 'MAX(a, b)', desc: 'Larger of two numbers (Orbit extension).', example: 'MAX(3, 7)' },
  { kw: 'MIN', cat: 'Math', syntax: 'MIN(a, b)', desc: 'Smaller of two numbers (Orbit extension).', example: 'MIN(3, 7)' },
  { kw: 'RANDOMIZE', cat: 'Math', syntax: 'RANDOMIZE [seed]', desc: 'Seeds the random generator. RANDOMIZE TIMER is the usual form.', example: 'RANDOMIZE TIMER' },
  { kw: 'RND', cat: 'Math', syntax: 'RND[(n)]', desc: 'Random number in [0,1). RND(0) repeats the last value.', example: 'PRINT INT(RND * 6) + 1' },
  { kw: 'SGN', cat: 'Math', syntax: 'SGN(n)', desc: 'Sign of n: -1, 0 or 1.', example: 'SGN(-8)' },
  { kw: 'SIN', cat: 'Math', syntax: 'SIN(n)', desc: 'Sine of n.' },
  { kw: 'SQR', cat: 'Math', syntax: 'SQR(n)', desc: 'Square root of n.', example: 'SQR(16)' },
  { kw: 'TAN', cat: 'Math', syntax: 'TAN(n)', desc: 'Tangent of n.' },
  { kw: '*', cat: 'Math', syntax: 'a * b', desc: 'Multiplies two numbers.', example: 'PRINT 3 * 4' },
  { kw: '+', cat: 'Math', syntax: 'a + b', desc: 'Adds numbers; also joins two strings.', example: 'PRINT "A" + "B"' },
  { kw: '-', cat: 'Math', syntax: 'a - b | -a', desc: 'Subtracts; as a prefix it negates.', example: 'PRINT 7 - 2' },
  { kw: '/', cat: 'Math', syntax: 'a / b', desc: 'Divides. Dividing by zero is a runtime error.', example: 'PRINT 1 / 4' },
  { kw: '<', cat: 'Math', syntax: 'a < b', desc: 'Less than. Strings compare lexically. True is -1, false 0.', example: 'PRINT 1 < 2' },
  { kw: '<=', cat: 'Math', syntax: 'a <= b', desc: 'Less than or equal to.', example: 'PRINT 2 <= 2' },
  { kw: '<>', cat: 'Math', syntax: 'a <> b', desc: 'Not equal to.', example: 'PRINT 1 <> 2' },
  { kw: '=', cat: 'Math', syntax: 'a = b', desc: 'Equal to. True is -1, false is 0.', example: 'PRINT 1 = 1' },
  { kw: '>', cat: 'Math', syntax: 'a > b', desc: 'Greater than. Strings compare lexically.', example: 'PRINT 3 > 2' },
  { kw: '>=', cat: 'Math', syntax: 'a >= b', desc: 'Greater than or equal to.', example: 'PRINT 3 >= 4' },
  { kw: '\\', cat: 'Math', syntax: 'a \\ b', desc: 'Integer division; both operands are rounded first.', example: 'PRINT 7 \\ 2' },
  { kw: '^', cat: 'Math', syntax: 'a ^ b', desc: 'Raises a to the power b.', example: 'PRINT 2 ^ 8' },
  { kw: 'AND', cat: 'Math', syntax: 'a AND b', desc: 'Logical and; bitwise on integers.', example: 'PRINT 1 AND 3' },
  { kw: 'MOD', cat: 'Math', syntax: 'a MOD b', desc: 'Remainder; the result has the sign of a.', example: 'PRINT 7 MOD 3' },
  { kw: 'NOT', cat: 'Math', syntax: 'NOT a', desc: 'Logical not; bitwise on integers.', example: 'PRINT NOT 0' },
  { kw: 'OR', cat: 'Math', syntax: 'a OR b', desc: 'Logical or; bitwise on integers.', example: 'PRINT 1 OR 2' },
  { kw: 'XOR', cat: 'Math', syntax: 'a XOR b', desc: 'Exclusive or; bitwise on integers.', example: 'PRINT 3 XOR 1' },

  // Time
  { kw: 'DATE$', cat: 'Time', syntax: 'DATE$', desc: 'Current date as "MM-DD-YYYY".', example: 'PRINT DATE$' },
  { kw: 'SLEEP', cat: 'Time', syntax: 'SLEEP [seconds]', desc: 'Waits for the given seconds; with no argument, waits for a key.', example: 'SLEEP 2' },
  { kw: 'TIME$', cat: 'Time', syntax: 'TIME$', desc: 'Current time as "HH:MM:SS".', example: 'PRINT TIME$' },
  { kw: 'TIMER', cat: 'Time', syntax: 'TIMER', desc: 'Seconds since midnight.', example: 'PRINT TIMER' },

  // Graphics
  { kw: 'CIRCLE', cat: 'Graphics', syntax: 'CIRCLE (x, y), r[, color]', desc: 'Draws a circle of radius r centered at (x, y).', example: 'CIRCLE (160, 100), 40, 7' },
  { kw: 'LINE', cat: 'Graphics', syntax: 'LINE [(x1, y1)]-(x2, y2)[, c][, B|BF]', desc: 'Draws a line; B draws a box, BF a filled box.', example: 'LINE (0, 0)-(319, 199), 7' },
  { kw: 'PAINT', cat: 'Graphics', syntax: 'PAINT (x, y)[, color[, border]]', desc: 'Fills an area starting at (x, y).', example: 'PAINT (10, 10), 4' },
  { kw: 'POINT', cat: 'Graphics', syntax: 'POINT(x, y)', desc: 'Returns the color of the pixel at (x, y).', example: 'PRINT POINT(10, 10)' },
  { kw: 'PRESET', cat: 'Graphics', syntax: 'PRESET (x, y)', desc: 'Resets the pixel at (x, y).', example: 'PRESET (10, 10)' },
  { kw: 'PSET', cat: 'Graphics', syntax: 'PSET (x, y)[, color]', desc: 'Sets the pixel at (x, y), optionally to a color.', example: 'PSET (10, 10), 9' },
  { kw: 'SCREEN', cat: 'Graphics', syntax: 'SCREEN w, h', desc: 'Resizes the program window, up to 640x400.', example: 'SCREEN 640, 400' },

  // Sound
  { kw: 'BEEP', cat: 'Sound', syntax: 'BEEP', desc: 'Plays a beep.' },
  { kw: 'PLAY', cat: 'Sound', syntax: 'PLAY mml$', desc: 'Plays a music string in the QBasic music macro language.', example: 'PLAY "O4 L8 CDEFGAB"' },
  { kw: 'SOUND', cat: 'Sound', syntax: 'SOUND freq, duration', desc: 'Plays a tone; duration is in clock ticks (18.2 per second).', example: 'SOUND 440, 18' },

  // Files
  { kw: 'CLOSE', cat: 'Files', syntax: 'CLOSE [#n]', desc: 'Closes a file; it is written to disk on CLOSE.', example: 'CLOSE #1' },
  { kw: 'EOF', cat: 'Files', syntax: 'EOF(n)', desc: 'True when file n is at its end.', example: 'IF EOF(1) THEN CLOSE #1' },
  { kw: 'FILES', cat: 'Files', syntax: 'FILES [dir$]', desc: 'Prints a listing of files in a folder.', example: 'FILES "/Documents"' },
  { kw: 'INPUT #', cat: 'Files', syntax: 'INPUT #n, vars', desc: 'Reads values from an open file.', example: 'INPUT #1, a$' },
  { kw: 'KILL', cat: 'Files', syntax: 'KILL name$', desc: 'Deletes a file.', example: 'KILL "old.txt"' },
  { kw: 'LINE INPUT #', cat: 'Files', syntax: 'LINE INPUT #n, var$', desc: 'Reads one whole line from an open file.', example: 'LINE INPUT #1, l$' },
  { kw: 'MKDIR', cat: 'Files', syntax: 'MKDIR dir$', desc: 'Creates a folder.', example: 'MKDIR "games"' },
  { kw: 'NAME', cat: 'Files', syntax: 'NAME old$ AS new$', desc: 'Renames a file.', example: 'NAME "a.txt" AS "b.txt"' },
  { kw: 'OPEN', cat: 'Files', syntax: 'OPEN name FOR INPUT|OUTPUT|APPEND AS #n', desc: 'Opens a file for reading, writing or appending.', example: 'OPEN "notes.txt" FOR INPUT AS #1' },
  { kw: 'PRINT #', cat: 'Files', syntax: 'PRINT #n, items', desc: 'Writes to an open file, formatted the same as PRINT.', example: 'PRINT #1, "hello"' },

  // Data
  { kw: 'DATA', cat: 'Data', syntax: 'DATA v1, v2, ...', desc: 'Holds constant values that READ takes in order.', example: 'DATA 1, 2, "three"' },
  { kw: 'READ', cat: 'Data', syntax: 'READ var[, var ...]', desc: 'Reads the next values from DATA statements.', example: 'READ a, b, c$' },
  { kw: 'RESTORE', cat: 'Data', syntax: 'RESTORE [label]', desc: 'Starts reading DATA again from the start or from a label.', example: 'RESTORE table' },
];
