import { writable } from "svelte/store";

// The file tree the backend returns is a nested array where a file is the
// string "name:servers/<id>/rel/path:size" and a folder is the tuple
// ["name:path:size", [ ...children ]].
export type TreeEntry = string | [string, TreeEntry[]];

export interface DragPayload {
  path: string;
  name: string;
  isFolder: boolean;
}

export interface FolderOption {
  path: string;
  name: string;
  depth: number;
}

// The row currently being dragged. This lives in a store rather than the HTML5
// dataTransfer payload because dataTransfer is unreadable during dragover,
// which is exactly when a drop target has to decide if it's a valid target.
export const draggedEntry = writable<DragPayload | null>(null);

// Published by the files page so nested rows can offer a "Move to…" picker
// without threading the whole tree down through props.
export const fileTree = writable<TreeEntry[]>([]);
export const treeRoot = writable<string>("");

// The entry whose "Move to…" dialog is open, or null. One shared picker is
// mounted on the files page — mounting one per row would put the whole folder
// list in the DOM once for every file on the server.
export const moveTarget = writable<DragPayload | null>(null);

function descriptorOf(entry: TreeEntry): string {
  return Array.isArray(entry) ? entry[0] : entry;
}

export function isFolderEntry(entry: TreeEntry): boolean {
  return Array.isArray(entry);
}

// Descriptors are "name:path:size". A name could itself contain a colon, so
// anchor on the first and last segments instead of splitting into exactly 3.
export function entryName(entry: TreeEntry): string {
  return descriptorOf(entry).split(":")[0];
}

export function entryPath(entry: TreeEntry): string {
  const parts = descriptorOf(entry).split(":");
  return parts.slice(1, -1).join(":");
}

function entrySize(entry: TreeEntry): string {
  const parts = descriptorOf(entry).split(":");
  return parts[parts.length - 1];
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

// Rewrite an entry (and, for a folder, everything beneath it) to sit at newPath.
function repath(entry: TreeEntry, newPath: string): TreeEntry {
  const descriptor = `${entryName(entry)}:${newPath}:${entrySize(entry)}`;
  if (!Array.isArray(entry)) return descriptor;

  const children = entry[1].map((child) =>
    repath(child, `${newPath}/${entryName(child)}`)
  );
  return [descriptor, children] as TreeEntry;
}

// Folders first, then files, each alphabetical — matches how the tree reads
// when it comes back from the server.
function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    const aFolder = Array.isArray(a);
    const bFolder = Array.isArray(b);
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return entryName(a).localeCompare(entryName(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

// Pull the entry at `path` out of the tree. Returns the entry plus the tree
// with it removed; entry is null when the path isn't found.
function extract(
  tree: TreeEntry[],
  path: string
): { tree: TreeEntry[]; entry: TreeEntry | null } {
  // Collected into an array rather than a single mutable local so the result
  // doesn't depend on how TS narrows a variable assigned inside the closure.
  const removed: TreeEntry[] = [];

  const walk = (nodes: TreeEntry[]): TreeEntry[] => {
    const out: TreeEntry[] = [];
    for (const node of nodes) {
      if (entryPath(node) === path) {
        removed.push(node);
        continue;
      }
      out.push(Array.isArray(node) ? ([node[0], walk(node[1])] as TreeEntry) : node);
    }
    return out;
  };

  const next = walk(tree);
  return removed.length > 0
    ? { tree: next, entry: removed[0] }
    : { tree, entry: null };
}

function insert(
  tree: TreeEntry[],
  destFolder: string,
  entry: TreeEntry,
  root: string
): TreeEntry[] {
  if (destFolder === root) return sortEntries([...tree, entry]);

  return tree.map((node) => {
    if (!Array.isArray(node)) return node;
    if (entryPath(node) === destFolder) {
      return [node[0], sortEntries([...node[1], entry])] as TreeEntry;
    }
    return [node[0], insert(node[1], destFolder, entry, root)] as TreeEntry;
  });
}

// Why a given move isn't allowed, or null when it is. Returning the reason
// lets the picker explain itself instead of just greying a row out.
export function moveBlockedReason(
  source: DragPayload | null,
  destFolder: string
): string | null {
  if (!source) return "Nothing selected.";
  if (destFolder === source.path) return "A folder can't be moved into itself.";
  if (parentOf(source.path) === destFolder) return "Already in this folder.";
  if (source.isFolder && destFolder.startsWith(source.path + "/")) {
    return "A folder can't be moved inside itself.";
  }
  return null;
}

export function canDrop(source: DragPayload | null, destFolder: string): boolean {
  return moveBlockedReason(source, destFolder) === null;
}

// Every folder in the tree, flattened and indented, for the "Move to…" picker.
export function listFolders(tree: TreeEntry[], root: string): FolderOption[] {
  const out: FolderOption[] = [{ path: root, name: "Main Folder", depth: 0 }];

  const walk = (nodes: TreeEntry[], depth: number) => {
    for (const node of nodes) {
      if (!Array.isArray(node)) continue;
      out.push({ path: entryPath(node), name: entryName(node), depth });
      walk(node[1], depth + 1);
    }
  };

  walk(tree, 1);
  return out;
}

// Apply a move, returning the new tree. `movedPath` is where the entry ended
// up, so callers can report or undo it.
export function applyMove(
  tree: TreeEntry[],
  sourcePath: string,
  destFolder: string,
  root: string
): { tree: TreeEntry[]; movedPath: string | null } {
  const { tree: without, entry } = extract(tree, sourcePath);
  if (!entry) return { tree, movedPath: null };

  const destPath = `${destFolder}/${entryName(entry)}`;
  const moved = repath(entry, destPath);
  return { tree: insert(without, destFolder, moved, root), movedPath: destPath };
}

// Path as the user reads it: "/plugins/config.yml" rather than the on-disk
// "servers/12/plugins/config.yml".
export function displayPath(path: string, root: string): string {
  if (path === root) return "/";
  return path.startsWith(root) ? path.slice(root.length) : path;
}

// Path as the file endpoints expect it: relative to the server root, with "*"
// standing in for the root itself — the convention the upload route already
// uses, and what resolveInServer's allowRoot branch matches on.
export function relativeTo(path: string, root: string): string {
  if (path === root) return "*";
  const rel = path.startsWith(root + "/") ? path.slice(root.length + 1) : path;
  return rel === "" ? "*" : rel;
}
