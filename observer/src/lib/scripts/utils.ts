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

// Moves the node (and its children) to document.body on mount, so fixed-position
// modals nested inside a `.neutralGradientStroke` card escape that ancestor's
// z-index stacking context instead of being trapped beneath sibling cards.
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.parentNode?.removeChild(node);
    }
  };
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

// Stack trace and known repetitive patterns that should always group
const GROUPED_LINE_PREFIXES = ["at "];

// Extract all phrases (words/tokens) longer than 6 characters from a line
function extractPhrases(line: string): Set<string> {
  const tokens = line.split(/\s+/);
  const phrases = new Set<string>();
  for (const token of tokens) {
    // Remove common punctuation but keep the core word
    const cleaned = token.replace(/[.,!?;:\[\](){}]/g, "");
    if (cleaned.length > 6) {
      phrases.add(cleaned.toLowerCase());
    }
  }
  return phrases;
}

// Check if a line matches any of the known prefixes
function matchesPrefixPattern(line: string): boolean {
  const trimmed = line.trimStart();
  return GROUPED_LINE_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}

// Find common phrases between two lines
function findCommonPhrases(phrases1: Set<string>, phrases2: Set<string>): Set<string> {
  const common = new Set<string>();
  for (const phrase of phrases1) {
    if (phrases2.has(phrase)) {
      common.add(phrase);
    }
  }
  return common;
}

// Groups console lines into the rows the terminal renders. A run of consecutive
// lines sharing common phrases (>6 chars) collapses into a single row, so a
// 60-frame stack trace (or 200 repeated warnings) costs one line of the console
// instead of sixty; everything else stays one line per row.
//
// `lineNum` is the number of the first line in the row, which is also the key
// the collapse state is stored under - stable because the console only ever
// gets appended to.
export function groupStackFrames(lines: string[]) {
  const rows: { lineNum: number; lines: string[] }[] = [];
  const phraseCache: Set<string>[] = lines.map(line => extractPhrases(line));
  const prefixCache: boolean[] = lines.map(line => matchesPrefixPattern(line));

  for (let i = 0; i < lines.length; i++) {
    const currentPrefix = prefixCache[i];

    // For "at" chains, allow occasional non-"at" lines in between
    if (currentPrefix) {
      let groupEnd = i;
      let consecutiveNonAtCount = 0;

      while (groupEnd + 1 < lines.length) {
        const nextIsAt = prefixCache[groupEnd + 1];

        if (nextIsAt) {
          // Found another "at" line, continue the group
          groupEnd++;
          consecutiveNonAtCount = 0;
        } else {
          // Non-"at" line - allow up to 1 consecutive non-"at" line within the chain
          consecutiveNonAtCount++;
          if (consecutiveNonAtCount <= 1) {
            groupEnd++;
          } else {
            break;
          }
        }
      }

      const group: string[] = [];
      for (let j = i; j <= groupEnd; j++) {
        group.push(lines[j]);
      }
      rows.push({ lineNum: i + 1, lines: group });
      i = groupEnd;
      continue;
    }

    // Check if current line shares phrases with the next line (dynamic grouping)
    const nextPhrases = i + 1 < lines.length ? phraseCache[i + 1] : new Set<string>();
    const hasNextMatch = i + 1 < lines.length && findCommonPhrases(phraseCache[i], nextPhrases).size > 0;

    if (hasNextMatch) {
      // Count how many consecutive lines share phrases starting from this one
      let groupEnd = i;
      while (groupEnd + 1 < lines.length && findCommonPhrases(phraseCache[groupEnd], phraseCache[groupEnd + 1]).size > 0) {
        groupEnd++;
      }

      // Only group if we have 3 or more consecutive lines
      const groupSize = groupEnd - i + 1;
      if (groupSize >= 3) {
        const group: string[] = [];
        for (let j = i; j <= groupEnd; j++) {
          group.push(lines[j]);
        }
        rows.push({ lineNum: i + 1, lines: group });
        i = groupEnd;
        continue;
      }
    }

    rows.push({ lineNum: i + 1, lines: [lines[i]] });
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