import Alert from "$lib/components/ui/Alert.svelte";

export function numShort(num: number) {

  if (num < 1000) return num.toString();
  if (num < 1000000) return `${(num / 1000).toFixed(1)}k`;
  if (num < 1000000000) return `${(num / 1000000).toFixed(2)}m`;
  return `${(num / 1000000000).toFixed(3)}b`;
}

export function fileSizeShort(bytes: number) {

  if (bytes < 100) return bytes.toString();
  if (bytes < 100000) return `${(bytes / 1000).toFixed(1)}kB`;
  if (bytes < 100000000) return `${(bytes / 1000000).toFixed(1)}mB`;
  return `${(bytes / 1000000000).toFixed(1)}gB`;
}

export function includesAny(str:string, substrings:string[]) {
  return substrings.some(substring => str.indexOf(substring) !== -1);
}

export function downloadProgressShort(currentBytes: number, totalBytes: number) {

  let unit = 'B';
  let unitDivisor = 1;  
  let current:any = currentBytes;
  let total:any = totalBytes;

  if (total < Math.pow(1024, 3) * 100) { // For gigabytes (GB)
    unit = 'gB';
    unitDivisor = Math.pow(1024, 3);
}
if (total < Math.pow(1024, 2) * 100) { // For megabytes (MB)
    unit = 'mB';
    unitDivisor = Math.pow(1024, 2);
}
if (total < 1024 * 100) { // For kilobytes (kB)
    unit = 'kB';
    unitDivisor = 1024;
}

  console.error("total = " + total + ", shortened = " + (total / unitDivisor).toFixed(1) + unit);

  total = (total / unitDivisor).toFixed(1);
  current = (current / unitDivisor).toFixed(1);

  return `${current}/${total}${unit}`;


}

// Drops log-level blocks from a console line for display - "[Server thread/INFO]",
// "[main/WARN]" and friends. A trailing ":" belongs to the block rather than the
// message ("[Server thread/INFO]: Done" -> "Done"), so it goes too, along with
// the single space that followed it.
export function stripLogLevelBlocks(line: string) {
  return line.replace(/\[[^[\]]*\/(?:INFO|WARN)\]:?[ \t]?/g, "");
}

// Lines a run of which folds into a single console row. Two kinds of match:
//
//   GROUPED_LINE_PREFIXES  - the line starts with this (leading whitespace
//                            ignored, so indented stack frames still match)
//   GROUPED_LINE_CONTAINS  - the token appears anywhere in the line
//
// Both are matched case-sensitively. Adding a new kind of repetitive log spam
// is a one-line addition to whichever list fits.
export const GROUPED_LINE_PREFIXES = ["at "];
export const GROUPED_LINE_CONTAINS = [
  "Incorrect key",
  "Loaded entity",
  "Skipping loading recipe",
];

// What a line groups under, or null if it groups with nothing. Two lines only
// fold together when this is equal for both, so a run of stack frames sitting
// directly above a run of "Incorrect key" warnings stays two rows.
function lineGroupKey(line: string) {
  const start = line.trimStart();
  for (const prefix of GROUPED_LINE_PREFIXES) {
    if (start.startsWith(prefix)) return "prefix:" + prefix;
  }
  for (const token of GROUPED_LINE_CONTAINS) {
    if (line.includes(token)) return "contains:" + token;
  }
  return null;
}

// Groups console lines into the rows the terminal renders. A run of consecutive
// lines sharing a group key collapses into a single row, so a 60-frame stack
// trace (or 200 repeated warnings) costs one line of the console instead of
// sixty; everything else stays one line per row.
//
// `lineNum` is the number of the first line in the row, which is also the key
// the collapse state is stored under - stable because the console only ever
// gets appended to.
export function groupStackFrames(lines: string[]) {
  const rows: { lineNum: number; lines: string[] }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const key = lineGroupKey(lines[i]);

    // a lone matching line is left as an ordinary row - grouping starts at two
    if (key !== null && key === lineGroupKey(lines[i + 1] || "")) {
      const start = i;
      const group: string[] = [];
      while (i < lines.length && lineGroupKey(lines[i]) === key) {
        group.push(lines[i]);
        i++;
      }
      i--;
      rows.push({ lineNum: start + 1, lines: group });
    } else {
      rows.push({ lineNum: i + 1, lines: [lines[i]] });
    }
  }

  return rows;
}

export function handleDesc(desc: string, suffix: string = "") {
  let newDesc = desc;
        //change youtube.com to youtube-nocookie.com
        newDesc = newDesc.replaceAll(
          "https://www.youtube.com/embed",
          "https://www.youtube-nocookie.com/embed"
        );
        newDesc = newDesc.replaceAll("http://", "https://");

      //change the width of youtube videos to fit the screen
      let width = document.getElementById("body" + suffix).offsetWidth;
      let divideAmount = 1.87;
      if (window.innerWidth < 768) divideAmount = 1.8;
      let newDimensions = 'class="w-full" style="height: '+(Math.round(width / divideAmount))+'px;"';
      newDesc = newDesc.replaceAll(
        'height: 150px',
        'height: ' + (width / 1.77) + 'px'
      );
      newDesc = newDesc.replaceAll(
        'height="358" width="638"',
        newDimensions
      );
      newDesc = newDesc.replaceAll(
        'height="360" width="640"',
        newDimensions
      );
        //make all links open in a new tab
        newDesc = newDesc.replaceAll(
          "href=",
          'target="_blank" rel="noreferrer" href='
        );
  return newDesc;
}

export function alert(msg: string, type: string = "error") {

  let alert = new Alert({
    target: document.body,
    props: {

      type: type,
      msg: msg,
    },
  });
  //4.5 seconds for showing the alert, 2 seconds for the fade animation
  setTimeout(() => {
    alert.$destroy();

  }, 6500);
}