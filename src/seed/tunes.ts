import type { SeedFile } from '../fs/seed';

/** strip comment lines (starting with ') and join the rest into one MML string */
export function mmlFromMus(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith("'"))
    .join(' ');
}

const SUNSET = `' Sunset Drive -- Orbit Music
' original composition, A minor, warm synthwave
T100 WT V11 O4 L4
E2 A4 B4
>C2 C4 <A4
G4 E4 G2
D4 G4 B2
A4 B4 >C4 E4<
>D2 C4 <A4
B4 G4 A4 B4
A2 P4 E4
A4 >C4 E2<
>F4 E4 C2<
>E4 G4 E4 C4<
>D2 <B2
>C4 E4 A4 G4<
>A4 F4 C2<
>D4 <B4 G4 B4
>E4 C4 <A2
A2 F4 A4
B2 >D4 <B4
B4 >C4 E4 C4<
A1
;
T100 WS V8 O2 L8
A A A E A A >C< E
F F F C F F A C
C C C G C C E G
G G G D G G B D
A A A E A A >C< E
F F F C F F A C
G G G D G G B D
A A A E A A >C< E
A A A E A A >C< E
F F F C F F A C
C C C G C C E G
G G G D G G B D
A A A E A A >C< E
F F F C F F A C
G G G D G G B D
A A A E A A >C< E
F F F C F F A C
G G G D G G B D
A A A E A A >C< E
A1
;
T100 WN V4 MS L8
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C C C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C P C P C
P C P C C C C C
P C P C P C P C
P C P C P C P C
P C P C P C P C
C2 P2
`;

const ORBIT = `' Orbit Boot Anthem -- Orbit Music
' original composition, C major, upbeat
T132 WS V10 O4 L4
C8 E8 G8 >C8 E8 C8 <G8 E8
G8 B8 >D4 G4. P8<
E8 E8 G8 G8 >C4 <G4
B8 B8 >D8 D8 G4 D4<
A8 A8 >C8 C8 E4 C4<
A8 G8 F8 E8 F2
E8 G8 >C8 E8 G4 E4<
B8 >D8 G8 <B8 >D4 <G4
A4 >C4 F4 E4<
D4 G4 B4 >D4<
>C8 C8 E8 E8 G4 E4<
>D8 D8 G8 G8 B4 G4<
>C8 C8 E8 E8 A4 E4<
>C8 D8 E8 F8 A4 G4<
>G8 E8 C8 E8 G8 E8 C8 E8<
>B8 G8 D8 G8 B8 G8 D8 G8<
>F8 A8 >C8 <A8 F4 A4<
>D4 G4 B2<
G8 B8 >D8 G8 <B4 >D4<
>C1<
;
T132 WT V10 O2 L8
C4 E4 G4 E4
G4 B4 >D4< B4
C G >C< G C G >C< G
G >D< G >D< G >D< G >D<
A >E< A >E< A >E< A >E<
F >C< F >C< F >C< F >C<
C G >C< G C G >C< G
G >D< G >D< G >D< G >D<
F >C< F >C< F >C< F >C<
G >D< G >D< G >D< G >D<
C G >C< G C G >C< G
G >D< G >D< G >D< G >D<
A >E< A >E< A >E< A >E<
F >C< F >C< F >C< F >C<
C G >C< G C G >C< G
G >D< G >D< G >D< G >D<
F >C< F >C< F >C< F >C<
G >D< G >D< G >D< G >D<
G >D< G >D< G >D< G >D<
C1
;
T132 WN V4 MS L8
P4 C4 P4 C4
P4 C4 C8 C8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C16 C16 P8 C16 C16 P8 C16 C16 P8 C16 C16 P8
C16 C16 P8 C16 C16 P8 C16 C16 P8 C16 C16 P8
C16 C16 P8 C16 C16 P8 C16 C16 P8 C16 C16 P8
C16 C16 P8 C16 C16 P8 C16 C16 P8 C16 C16 P8
C16 C16 P8 C16 C16 P8 C16 C16 P8 C16 C16 P8
C16 C16 P8 C16 C16 P8 C16 C16 P8 C16 C16 P8
C16 C16 P8 C16 C16 P8 C16 C16 P8 C16 C16 P8
C16 C16 P8 C16 C16 P8 C16 C16 P8 C16 C16 P8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C2 P2
`;

const RAIN = `' Rain on the Window -- Orbit Music
' original composition, D minor, slow
T72 WT ML V10 O4 L4
A2 F4 E4
D2. F4
A2 G4 F4
E2. D4
F4 A4 >D2<
>D4 C4 <B-2
A4 G4 B-4 A4
G4 E4 C#2
B-2 A4 G4
F2. E4
D4 F4 B-2
C#2 E2
>D2 C4 <B-4
A4 B-4 >D2<
>C#2 <A4 E4
D1
;
T72 WS V6 O2 L4
D A >D< A
B- >F< B- >F<
F >C< F >C<
C G >C< G
D A >D< A
B- >F< B- >F<
G >D< G >D<
A >E< A >E<
G >D< G >D<
D A >D< A
B- >F< B- >F<
A >E< A >E<
B- >F< B- >F<
G >D< G >D<
A >E< A >E<
D1
;
T72 WN V2 MS L4
P4 C16 P8. P4 P8 C16 P16
P8 C16 P16 P4 P4 C16 P8.
P4 C16 P8. P4 P8 C16 P16
P8 C16 P16 P4 P4 C16 P8.
P4 C16 P8. P4 P8 C16 P16
P8 C16 P16 P4 P4 C16 P8.
P4 C16 P8. P4 P8 C16 P16
P8 C16 P16 P4 P4 C16 P8.
P4 C16 P8. P4 P8 C16 P16
P8 C16 P16 P4 P4 C16 P8.
P4 C16 P8. P4 P8 C16 P16
P8 C16 P16 P4 P4 C16 P8.
P4 C16 P8. P4 P8 C16 P16
P8 C16 P16 P4 P4 C16 P8.
P4 C16 P8. P4 P8 C16 P16
P1
`;

const ARCADE = `' Pixel Chase -- Orbit Music
' original composition, C major, fast and bouncy
T170 WS MS V10 O4 L8
E G >C <G E G >C E<
>G E C E G4 P4<
F A >C <A F A >C F<
G B >D <B >D G D4<
E E G G >C C E E<
A >C E C <A >C E4<
>F E D C <A4 F4
D4 G G B4 >D4<
A A >C4 <A A >E4<
A A >C4 <A A >F4<
G G >E4 C C E4<
B B >D4 <B B >G4<
E16 A16 >C16 E16 A8 E8 C8 <A8 E4
F16 A16 >C16 F16 A8 F8 C8 <A8 F4
G B >D G B4 D4<
D D D D G G B B
E G >C <G E G >C E<
>G E C E G >C <G E<
F A >C <A F A >C F<
G B >D <B >D G D4<
E E G G >C C E E<
>F E D C <A4 F4
D4 G G B4 >D4<
>C1<
;
T170 WS V7 O2 L8
C >C< C >C< C >C< C >C<
C >C< C >C< C >C< C >C<
F >F< F >F< F >F< F >F<
G >G< G >G< G >G< G >G<
C >C< C >C< C >C< C >C<
A >A< A >A< A >A< A >A<
F >F< F >F< F >F< F >F<
G >G< G >G< G >G< G >G<
A >A< A >A< E >E< A >A<
F >F< F >F< C >C< F >F<
C >C< C >C< G >G< C >C<
G >G< G >G< D >D< G >G<
A >A< A >A< E >E< A >A<
F >F< F >F< C >C< F >F<
G >G< G >G< G >G< G >G<
G >G< G >G< G >G< G >G<
C >C< C >C< C >C< C >C<
C >C< C >C< C >C< C >C<
F >F< F >F< F >F< F >F<
G >G< G >G< G >G< G >G<
C >C< C >C< C >C< C >C<
F >F< F >F< F >F< F >F<
G >G< G >G< G >G< G >G<
C1
;
T170 WN V4 MS L8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C16 C16 C16 C16 C8 C8 C8 C8 C4
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C16 C16 C16 C16 C8 C8 C8 C8 C4
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C8 P8 C8 P8 C8 P8 C8 C8
C16 C16 C16 C16 C8 C8 C8 C8 C4
C2 P2
`;

const LULLABY = `' Little Star Lullaby -- Orbit Music
' original composition, C major, 3/4 waltz, very soft
T66 WT ML V9 O4 L4
E2 G4
E4 D4 C4
A2 F4
E2.
D2 G4
B4 A4 G4
E4 G4 >C4<
B2.
>C2 <G4
E4 G4 E4
A4 >C4 F4<
>E2.<
>D2 <B4
G4 A4 B4
>C4 E4 G4<
F2.
A2 F4
G4 E4 C4
D4 G4 B4
>C2.<
;
T66 WT V6 O3 L4
C E G
C E G
F A >C<
C E G
G B >D<
G B >D<
C E G
G B >D<
C E G
C E G
F A >C<
C E G
G B >D<
G B >D<
C E G
G B >D<
F A >C<
C E G
G B >D<
C2.
`;

export const TUNE_SEEDS: SeedFile[] = [
  { path: '/Music/SUNSET.MUS', content: SUNSET, since: 3 },
  { path: '/Music/ORBIT.MUS', content: ORBIT, since: 3 },
  { path: '/Music/RAIN.MUS', content: RAIN, since: 3 },
  { path: '/Music/ARCADE.MUS', content: ARCADE, since: 3 },
  { path: '/Music/LULLABY.MUS', content: LULLABY, since: 3 },
];
