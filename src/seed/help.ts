// Built-in help pages for orbit:home and orbit:help/<page>.
// Markdown subset only. Plain ASCII.

export const HELP_PAGES: Record<string, string> = {
  'home': `# The World Is Online

Every library, newsroom and museum on the planet is a few keystrokes away.
Type an address, follow a number, or just ask -- and it all comes to you.

## Search anything
Type words in the address bar and press **Enter**. Try
\`history of the telephone\`, \`how volcanoes work\` or \`best pancake recipe\`.

## Knowledge
- [Wikipedia](https://en.wikipedia.org/wiki/Main_Page) -- the encyclopedia of everything
- [A random article](https://en.wikipedia.org/wiki/Special:Random) -- learn something new
- [On this day in history](https://en.wikipedia.org/wiki/Wikipedia:Selected_anniversaries)
- [Stanford Encyclopedia of Philosophy](https://plato.stanford.edu)

## News
- [NPR](https://text.npr.org)
- [CNN](https://lite.cnn.com)
- [BBC News](https://www.bbc.com/news)
- [Hacker News](https://news.ycombinator.com) -- what technologists are reading

## Libraries
- [Project Gutenberg](https://www.gutenberg.org) -- 70,000 free books
- [Open Library](https://openlibrary.org)
- [Internet Archive](https://archive.org)

## Science and space
- [NASA](https://www.nasa.gov)
- [Quanta Magazine](https://www.quantamagazine.org)
- [Smithsonian](https://www.si.edu)

## Getting around
- **Click** any underlined link, or type its number (like \`12\`) in the address bar.
- **Back** and **Forward**: the arrow buttons, or Alt+Left and Alt+Right.
- **F6** jumps to the address bar. **F5** reloads.
- **Bookmarks** menu: keep the places you love.
- **File > Save Page as Text** keeps a page in your Documents to read anytime.
- **Go > Set as Home Page** makes any page your start page.

[Orbit help](orbit:help)
`,

  'help': `# Orbit Help

## The basics
- [Desktop and windows](orbit:help/desktop)
- [Files and folders](orbit:help/files)
- [Keyboard shortcuts](orbit:help/keyboard)
- [Config](orbit:help/config)

## Apps
- [Write](orbit:help/write) -- word processor
- [Draw](orbit:help/draw) -- paint program
- [Calc](orbit:help/calc) -- spreadsheet
- [Internet Navigator](orbit:help/browser) -- explore the web
- [Console](orbit:help/console) -- the command line
- [Clock](orbit:help/clock) -- clock, stopwatch and timer
- [Music](orbit:help/music) -- song player and editor

## Programming
- [BASIC quick reference](orbit:help/basic)
- [BASIC window apps](orbit:help/basic-gui) -- buttons and forms

## About
- [About Orbit](orbit:help/about)
- [Back to the start page](orbit:home)
`,

  'help/desktop': `# Desktop and Windows

## Icons
The desktop shows what is in your /Desktop folder.

- Double-click an icon to open it.
- Drag an icon to move it.
- Drop an icon on the Trash to delete it.
- Arrow keys select icons when no window is open.

## Desktop right-click menu
- New Folder
- Import Files
- Clean Up Icons
- Wallpaper
- Empty Trash
- Config

## Launcher and bottom bar
- **Launch** (bottom left, or **F9**) opens the Orbit Launcher: pick a
  category, click a tile, or type in **Quick Run** to find apps, programs
  and files. Anything else you type runs in the Console. Click outside or
  press Esc to close it.
- Every open window has a button on the bottom bar. Click it to bring the
  window forward; click the active one to minimize it; click again to restore.
  Right-click a button for Restore, Minimize, Maximize and Close.

## Top bar
- **Planet menu**: About Orbit, Launcher, Config, Start Screensaver and Restart.
- **App menus**: the menus of the active app.
- **Disk usage**: click it for details.
- **Clock**: click for the date and a 24-hour toggle.

## Windows
- Drag the title bar to move a window.
- Resize from the edges or the corner.
- The title-bar boxes minimize, maximize and close.
- Double-click the title to maximize.
- Minimized windows wait on the bottom bar; click their button to restore.

## The screen
Orbit uses large square pixels. The screen changes shape when you
resize the browser window. Set the pixel size in Config > Display.

See also [Files](orbit:help/files), [Config](orbit:help/config).
`,

  'help/files': `# Files and Folders

## Viewing
- Switch between list and icon view in the View menu.
- In list view, click a column header to sort by name, size or date.
- Use the back and up buttons, or type in the path bar.

## Working with files
- New Folder creates a folder.
- Press F2 to rename.
- Cut, Copy, Paste: Ctrl+X, Ctrl+C, Ctrl+V.
- Duplicate makes a copy next to the original.
- Drag files between windows, the desktop and the Trash.
  Hold Ctrl while dragging to copy.

## Trash
Delete moves things to the Trash. Open the Trash folder to:
- Put Back in Documents
- Delete Permanently
- Empty Trash

## Getting files in and out
- Drag files from your real computer into a window to import.
- File > Import Files... does the same.
- Export to Computer downloads a file. Folders download as .zip.
- File > Back Up Whole Disk saves everything as a zip.
- File > Restore Disk loads such a zip again.

> Your disk lives in this browser's storage. Nothing leaves your
> computer unless you export it.

See also [Config](orbit:help/config) for Disk options.
`,

  'help/write': `# Write

A simple word processor.

## Formatting
- **Bold**, *italic*, underline: Ctrl+B, Ctrl+I, Ctrl+U,
  or use the toolbar.
- Large Text: the "Aa" button on the toolbar.
- Align left, center or right from the toolbar.
- Word wrap keeps long lines in view.

## Editing
- Undo: Ctrl+Z. Redo: Ctrl+Y.
- Find: Ctrl+F. Find Next: F3.
- Replace: Ctrl+H.
- File > New Window opens another Write window.

## Saving
- **.WRT** keeps bold, italic and other styles.
- **.TXT** saves plain text only.
- Ctrl+S saves, Ctrl+O opens.
- Export as Text and Export as HTML download a copy to your
  computer.

See also [Files](orbit:help/files), [Keyboard](orbit:help/keyboard).
`,

  'help/basic': `# BASIC Quick Reference

Orbit BASIC is a QBasic-style language. Line numbers are optional.
Keywords are case-insensitive; the editor upper-cases them.

## The editor
- Line numbers, colors and auto upper-case keywords.
- The help bar shows the keyword under the cursor.
- F1 opens the keyword list. Double-click one to insert it.
- F5 runs the program in its own window.
- Errors highlight the offending line.
- Run > Stop or Ctrl+Pause stops a program.
- Esc closes a finished program window.
- Double-click a .BAS file to run it. Use Open With > BASIC Editor to edit.
- Examples in /Programs: HELLO, GUESS, SUNSET, BOUNCE, TUNE, DIARY,
  PRIMES.

## Basics
\`\`\`basic
' a comment (or REM)
name$ = "Orbit"      ' $ = string
n = 42               ' all other names are numbers
CONST pi2 = 6.28318
DIM a(10)            ' indices 0..10
DIM g(3, 4)          ' 2-D array
PRINT "Hi "; name$, n
\`\`\`
- Statements are separated by new lines or \`:\`.
- Labels look like \`top:\`. Use \`GOTO top\` and \`GOSUB top\`.
- \`END\` stops the program.

## Operators
- \`^\` then unary \`-\`, then \`*\` \`/\`, then \`\\\` (integer divide),
  \`MOD\`, then \`+\` \`-\` (\`+\` joins strings).
- Compare with \`= <> < > <= >=\`. True is -1, false is 0.
- Then \`NOT\`, \`AND\`, and \`OR\` / \`XOR\`.

## Control flow
\`\`\`basic
IF x > 5 THEN PRINT "big" ELSE PRINT "small"
IF a = 1 THEN
  PRINT "one"
ELSEIF a = 2 THEN
  PRINT "two"
ELSE
  PRINT "many"
END IF

FOR i = 1 TO 10 STEP 2: PRINT i: NEXT i
WHILE n > 0: n = n - 1: WEND
DO
  x = x + 1
LOOP UNTIL x = 10

SELECT CASE n
  CASE 1, 2
    PRINT "low"
  CASE 3 TO 5
    PRINT "mid"
  CASE IS > 10
    PRINT "high"
  CASE ELSE
    PRINT "other"
END SELECT
\`\`\`
Use \`EXIT FOR\`, \`EXIT DO\`, \`EXIT WHILE\`, \`EXIT SUB\` or
\`EXIT FUNCTION\` to leave early.

## SUBs and FUNCTIONs
\`\`\`basic
SUB Greet (who$, times)
  FOR i = 1 TO times: PRINT "Hi "; who$: NEXT
END SUB

FUNCTION Square (n)
  Square = n * n
END FUNCTION

Greet "Ann", 2
PRINT Square(4)
\`\`\`
- Plain variables are passed by reference. \`(x)\` passes by value.
- Variables inside are local. \`DIM SHARED x\` shares a global.

## Input and output
- \`PRINT a; b\` joins items. \`,\` jumps to the next 14-column zone.
  A trailing \`;\` or \`,\` skips the new line.
- \`TAB(n)\`, \`SPC(n)\`, \`CLS\`, \`LOCATE row, col\`, \`COLOR fg, bg\`.
- \`INPUT "Name"; n$\` asks for a value.
- \`LINE INPUT "Text: "; l$\` reads a whole line.
- \`INKEY$\` returns the last key pressed, or "" (it does not wait).
- Numbers print with a leading space: \`PRINT 5\` gives " 5 ".

## Functions
- Strings: \`LEN LEFT$ RIGHT$ MID$ INSTR UCASE$ LCASE$ LTRIM$
  RTRIM$ SPACE$ STRING$ CHR$ ASC VAL STR$ HEX$\`
- Math: \`ABS SGN INT FIX CINT SQR SIN COS TAN ATN LOG EXP RND
  MIN MAX\`
- \`RANDOMIZE TIMER\` seeds the random numbers; \`RND\` gives 0 to <1.
- Time: \`TIMER\`, \`DATE$\`, \`TIME$\`, \`SLEEP seconds\`.

## Graphics and color
Each program window is a 320x200 screen with 16 colors.
\`SCREEN w, h\` resizes it (up to 640x400).
\`\`\`basic
SCREEN 320, 200
PSET (10, 10), 7
LINE (0, 0)-(100, 50), 6, BF    ' BF = filled box, B = box
CIRCLE (160, 100), 40, 4
PAINT (160, 100), 5, 4
c = POINT(10, 10)
\`\`\`
Colors: 0 ink, 1 dark plum, 2 plum, 3 magenta, 4 crimson, 5 red,
6 orange, 7 yellow, 8 pale, 9 cream, 10 tan, 11 grey, 12 mauve,
13 purple, 14 lavender, 15 green.

## Sound
\`\`\`basic
BEEP
SOUND 440, 9                 ' freq, ticks (18.2 per second)
PLAY "T120 O4 L8 CDEFGAB>C"
\`\`\`
See [Music](orbit:help/music) for the PLAY language.

## Files
\`\`\`basic
OPEN "notes.txt" FOR OUTPUT AS #1
PRINT #1, "hello"
CLOSE #1
OPEN "notes.txt" FOR INPUT AS #1
WHILE NOT EOF(1): LINE INPUT #1, l$: PRINT l$: WEND
CLOSE
\`\`\`
- Modes: INPUT, OUTPUT, APPEND. Also \`KILL\`, \`NAME a$ AS b$\`,
  \`MKDIR\`, \`FILES\`.
- Relative paths use the program's folder (or /Documents).

## DATA
\`\`\`basic
DATA 1, 2, "three"
READ a, b, c$
RESTORE
\`\`\`

## Errors
A runtime error stops the program and names the line, for example
\`Subscript out of range in line 12\`. Syntax errors are reported
before the program starts.

Next: [Window apps with buttons](orbit:help/basic-gui)
`,

  'help/basic-gui': `# BASIC Window Apps

A BASIC program can turn its window into a form with buttons,
labels and text boxes.

## Commands
- \`WINDOW "Title", w, h\` -- makes the program window a form
  of w x h pixels.
- \`BUTTON id, "Text", x, y, w, h\` -- adds a button.
- \`LABEL id, "Text", x, y, w, h\` -- adds a text label.
- \`TEXTBOX id, "Text", x, y, w, h\` -- adds an input box.
- \`SETTEXT id, text$\` -- changes the text of a control.
- \`GETTEXT$(id)\` -- reads the text of a control.
- \`e = WAITEVENT(timeoutMs)\` -- waits for something to happen.
- \`MOUSEX\`, \`MOUSEY\`, \`MOUSEB\` -- mouse position and buttons.

## WAITEVENT results
- The id of a button that was clicked.
- The id of a textbox when Enter is pressed in it.
- 0 when the timeout passes with nothing happening.
- -1 when the window is closed.

You can still draw on the window with \`PSET\`, \`LINE\`, \`PRINT\` and
the other graphics commands.

## Example: a counter
\`\`\`basic
WINDOW "Counter", 200, 100
LABEL 1, "0", 70, 10, 60, 16
BUTTON 2, "+", 20, 50, 40, 20
BUTTON 3, "-", 70, 50, 40, 20
BUTTON 4, "Quit", 120, 50, 60, 20
n = 0
DO
  e = WAITEVENT(1000)
  IF e = 2 THEN n = n + 1
  IF e = 3 THEN n = n - 1
  SETTEXT 1, STR$(n)
LOOP UNTIL e = 4 OR e = -1
\`\`\`

Each id should be a unique number. Use an id of your choice for
every control.

## Example apps
Look in /Programs:
- CALC.BAS -- a calculator
- CLOCK.BAS -- a clock
- LANDER.BAS -- land a ship on the pad
- TANKS.BAS -- an artillery duel (with a computer opponent)
- NITEMAZE.BAS -- a first-person maze chase
- TRADER.BAS -- a space trading game (saves to /Documents)
- WORM.BAS -- the classic snake, for one or two players
- MINES.BAS -- clear the star-mine meadow (mouse or keyboard)
- ADVENTUR.BAS -- a text adventure inside this very computer

Back to [BASIC quick reference](orbit:help/basic).
`,

  'help/draw': `# Draw

A MacPaint-style paint program.

## Tools
- Pencil
- Brush (3 sizes)
- Line
- Rectangle and filled rectangle
- Ellipse and filled ellipse
- Paint bucket fill
- Spray can
- Eraser
- Text
- Rectangle select: move, cut, copy, paste, delete
- Color picker (eyedropper)
- Zoom (FatBits)

## Colors and patterns
- 16-color palette. Left click sets the foreground color, right
  click sets the background color.
- Fill patterns (dithers) are used by the brush, fill, spray and
  filled shapes.
- Hold Shift for straight lines, squares and circles.

## Editing
- Undo and redo are in the Edit menu.
- Image > New size, Flip, Clear.

## Files
- Saves **.PIC** (Orbit picture).
- File > Export PNG saves a PNG to your computer.
- File > Import Image reads a PNG or JPG, reduces it to the 16
  colors, with optional dithering.

See also [Files](orbit:help/files).
`,

  'help/calc': `# Calc

A minimal spreadsheet: 26 columns (A-Z) and 99 rows.

## Entering data
- Type a number or text into a cell.
- Typing replaces the cell. F2 or double-click edits it.
- Delete clears the cell.
- Arrow keys, Enter and Tab move around.

## Formulas
A formula starts with \`=\`. You can use \`+ - * / ^\`, parentheses and
cell references.
\`\`\`
=A1*B2
=(A1+A2)/2
=C3^2
\`\`\`
There are no functions, to keep things simple.

## Copy and paste
Copying and pasting adjusts references. A \`$\` makes a reference
absolute: \`=$A$1*B2\` always points at A1.

## Errors
- \`#DIV/0!\` -- division by zero
- \`#REF!\` -- a bad cell reference
- \`#CYCLE!\` -- cells that depend on each other
- \`#VALUE!\` -- text used in a calculation
- \`#NAME?\` -- unknown name
- \`#ERROR!\` -- the formula could not be understood

## Files
Files are **.CSV**. Formulas are kept as text such as \`=A1+B1\`.

See also [Files](orbit:help/files).
`,

  'help/console': `# Console

A command line for Orbit HD. Type a command and press **Enter**.

## Everyday commands
- \`ls\`, \`ls -l\` -- list files. \`cd Music\`, \`cd ..\`, \`cd ~\` -- move around. \`pwd\` -- where am I?
- \`cat\`, \`head\`, \`tail\`, \`wc\`, \`grep\`, \`sort\`, \`uniq\` -- look inside files.
- \`mkdir\`, \`touch\`, \`cp\`, \`mv\`, \`rm\` (to the Trash), \`rmdir\` -- organise.
- \`find . -name "*.BAS"\`, \`tree\`, \`du\`, \`df\` -- explore the disk.
- \`open FILE\` or \`open draw\` -- open with an app. \`edit FILE\` -- edit it.
- \`date\`, \`cal\`, \`uptime\`, \`orbit\`, \`history\`, \`clear\`, \`help\`.

## Pipes and files
- \`ls -l | grep BAS\` -- send one command's output into another.
- \`echo hello > note.txt\` writes a file; \`>>\` adds to the end.

## BASIC built in
- Run a program by name: \`PRIMES\`, \`run GUESS.BAS\` or \`./HELLO.BAS\`.
  Programs in /Programs work from anywhere. Window apps open in their own window.
- Type any BASIC statement to run it right away:

\`\`\`
PRINT 6 * 7
FOR I = 1 TO 5: PRINT I * I;: NEXT
PLAY "T180 O4 L8 CDEFGAB>C"
\`\`\`

- \`basic\` opens the BASIC editor.

## Keys
- **Up/Down** -- previous commands. **Tab** -- complete names. **Esc** -- clear the line.
- **Ctrl+C** -- stop a running command or program.
`,
  'help/clock': `# Clock

A digital clock with glowing segments.

- **Clock** -- the time, with seconds and today's date. The button switches 12/24-hour.
- **Stopwatch** -- Start, Stop and Reset. Shows hundredths of a second.
- **Timer** -- add minutes with **+1 min**, then **Start**. It beeps and flashes at zero.

Click the clock in the top bar for the date and a shortcut to this app.
`,
  'help/browser': `# Internet Navigator

A text-only web browser.

## Using it
- Type a URL in the address bar. Type words to search the web.
- Links are numbered like [3]. Click one, or type its number in
  the address bar and press Enter.
- Back, Forward, Home and Reload are on the toolbar.
- Use the Bookmarks menu to save places.
- File > Save Page as Text saves into Documents.

## How it works
Browsers block direct cross-site requests (CORS). So Orbit asks a
"reader proxy" to fetch the page and turn it into plain text. The
default is https://r.jina.ai/.

Change the proxy or add an API key in Config > Network.

> The free proxy has rate limits. If a page fails, wait a minute
> and press Reload.

## Built-in pages
Pages that start with \`orbit:\` are built in and work offline.
- [orbit:home](orbit:home) -- the start page
- [orbit:help](orbit:help) -- this help

See also [Config](orbit:help/config).
`,

  'help/music': `# Music

Plays **.MUS** songs. Your songs are in /Music.

## Using it
- Play and Stop buttons.
- Voice meters show the three voices.
- Edit the song text and press Play to hear your changes.
- Save keeps your song.

## The song language
This is the same language as BASIC's \`PLAY\` command.
- Notes \`A\` to \`G\`, with \`#\` or \`-\` for sharp and flat.
- A number after a note is its length: \`C4\` quarter, \`C8\` eighth.
- \`O4\` sets the octave. \`<\` and \`>\` move it down and up.
- \`L8\` sets the default length. \`T120\` sets the tempo.
- \`P4\` is a rest.
- \`V0\` to \`V15\` sets the volume.
- \`WS\`, \`WT\`, \`WN\` pick square, triangle or noise sound.
- \`;\` separates up to 3 voices that play together.
- Lines starting with \`'\` are comments.

## Example
\`\`\`
' a little tune
T140 L8 WS O4 CDEF G4 G4 ; WT O3 C2 G2
\`\`\`

See [BASIC](orbit:help/basic) to play songs from programs.
`,

  'help/config': `# Config

Open Config from the planet menu, the Launcher (System), or the desktop right-click menu.

## Display
- Pixel size: Auto, or 1x to 5x.
- Wallpaper: Sunset, Plain or Pattern.
- Animate windows.
- Drag window outlines.

## Sound
- Sound on or off.
- Interface sounds.
- Volume.
- Test button.

## Clock
- 24-hour time.

## Network
- Reader proxy URL.
- Optional API key.
- Both are stored only in this browser.

## Disk
- Usage.
- Back Up and Restore.
- Erase Disk -- a factory reset. This deletes everything.

> Back up your disk before erasing it.

See [Files](orbit:help/files), [Internet Navigator](orbit:help/browser).
`,

  'help/keyboard': `# Keyboard

## Windows and menus
- Ctrl+F4 -- close the window.
- Ctrl+\` -- switch between windows.
- F10 -- open the menus. Arrow keys move, Enter chooses,
  Esc closes.
- F1 -- help for the current app.

## Dialogs
- Tab and Shift+Tab move between controls.
- Enter -- the default button.
- Esc -- cancel.

## Desktop
- Arrow keys select icons when no window is open.
- Delete moves selected icons to the Trash.
- Type letters to jump to an icon or file.

## Documents
- Ctrl+S saves, Ctrl+O opens.
- Ctrl+X, Ctrl+C, Ctrl+V cut, copy and paste.
- Ctrl+Z undo, Ctrl+Y redo.

> Browser shortcuts such as Ctrl+W, Ctrl+T and Ctrl+N are left to
> the real browser.

See also [Desktop](orbit:help/desktop).
`,

  'help/about': `# About Orbit

Orbit is a desktop computer that runs in a web page.

- It is a static page: no server and no accounts.
- Your files stay in this browser.
- Low resolution and 16 colors are on purpose.
- It was built as a love letter to 90s desktops.

## Credits
Made by Ricardo Staudt ([x.com/ricardostaudt](https://x.com/ricardostaudt))
and Claude Opus 5.5.

The source is at [github.com/staudt/orbit-os](https://github.com/staudt/orbit-os).

Have fun. Open the [BASIC page](orbit:help/basic) and write a
program, or go back to the [start page](orbit:home).
`,

};
