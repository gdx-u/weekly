import { puzzles } from "./puzzles.js";
import { parse_puz } from "./puz_parser.js";
import { load, save } from "./storage.js";

const $ = (id) => document.getElementById(id);
const other = { across: "down", down: "across" };
const arrows = {
  ArrowLeft: [0, -1, "across"],
  ArrowRight: [0, 1, "across"],
  ArrowUp: [-1, 0, "down"],
  ArrowDown: [1, 0, "down"],
};

function make(tag, class_name, text) {
  const node = document.createElement(tag);
  if (class_name) node.className = class_name;
  if (text !== undefined) node.textContent = text;
  return node;
}

const title_case = (text) => text[0].toUpperCase() + text.slice(1);

let name = null;
let puzzle = null;
let entries = [];
let cursor = 0;
let direction = "across";
let auto_check = load("xw_auto_check", false);
let wrong = new Set();
let cell_els = [];
let letter_els = [];
let clue_els = { across: [], down: [] };
let clue_of = [];

const progress_key = () => `xw_progress_${name}`;
const clue_at = (i, dir) => puzzle[dir][clue_of[i][dir]];
const current_clue = () => clue_at(cursor, direction);
const has_clue = (i, dir) => clue_of[i][dir] !== undefined;
const fillable = () => puzzle.cells.flatMap((c, i) => (c === null ? [] : [i]));

function set_theme(theme) {
  document.documentElement.dataset.theme = theme;
  $("theme").textContent = theme === "dark" ? "☀" : "☾";
  save("xw_theme", theme);
}

function build_tabs() {
  const tabs = $("tabs");
  tabs.innerHTML = "";
  Object.keys(puzzles).forEach((key) => {
    const button = make("button", key === name ? "tab active" : "tab", puzzles[key].label);
    button.onclick = () => open_puzzle(key);
    tabs.append(button);
  });
}

function build_tools() {
  const tools = $("tools");
  tools.innerHTML = "";
  const scopes = {
    letter: () => [cursor],
    word: () => current_clue().cells,
    grid: fillable,
  };
  const actions = {
    check: (cells) => cells.forEach((i) => entries[i] && entries[i] !== puzzle.cells[i] && wrong.add(i)),
    reveal: (cells) =>
      cells.forEach((i) => {
        entries[i] = puzzle.cells[i];
        wrong.delete(i);
      }),
  };
  Object.keys(actions).forEach((action) => {
    const group = make("div", "group");
    group.append(make("span", "group-label", title_case(action)));
    Object.keys(scopes).forEach((scope) => {
      const button = make("button", "tool", title_case(scope));
      button.onclick = () => {
        actions[action](scopes[scope]());
        save(progress_key(), entries);
        render();
      };
      group.append(button);
    });
    tools.append(group);
  });

  const auto = make("button", "tool toggle", "Auto-check");
  auto.setAttribute("aria-pressed", auto_check);
  auto.onclick = () => {
    auto_check = !auto_check;
    auto.setAttribute("aria-pressed", auto_check);
    save("xw_auto_check", auto_check);
    render();
  };
  const clear = make("button", "tool", "Clear");
  clear.onclick = () => {
    if (!confirm("Clear all your answers for this puzzle?")) return;
    entries = puzzle.cells.map(() => "");
    wrong.clear();
    save(progress_key(), entries);
    render();
  };
  tools.append(auto, clear);
}

function build_puzzle() {
  const grid = $("grid");
  grid.innerHTML = "";
  grid.style.setProperty("--cols", puzzle.width);
  clue_of = puzzle.cells.map(() => ({}));
  clue_els = { across: [], down: [] };

  cell_els = puzzle.cells.map((solution, i) => {
    const cell = make("div", solution === null ? "cell block" : "cell");
    if (solution !== null) {
      if (puzzle.numbers[i]) cell.append(make("span", "num", puzzle.numbers[i]));
      cell.append(make("span", "letter"));
      cell.onclick = () => click_cell(i);
    }
    grid.append(cell);
    return cell;
  });
  letter_els = cell_els.map((cell) => cell.querySelector(".letter"));

  ["across", "down"].forEach((dir) => {
    const list = $(dir);
    list.innerHTML = "";
    puzzle[dir].forEach((clue, index) => {
      clue.cells.forEach((i) => (clue_of[i][dir] = index));
      const item = make("li");
      item.append(make("b", "", clue.number), make("span", "", clue.text));
      item.onclick = () => select_clue(dir, index);
      list.append(item);
      clue_els[dir].push(item);
    });
  });
  link_refs();
  fit_grid();
}

function link_refs() {
  const index_of = { across: new Map(), down: new Map() };
  ["across", "down"].forEach((dir) => puzzle[dir].forEach((clue, index) => index_of[dir].set(clue.number, index)));
  const collect = (text) => {
    const found = [];
    const add = (numbers, word) => {
      const dir = word[0].toLowerCase() === "a" ? "across" : "down";
      numbers.forEach((n) => {
        const index = index_of[dir].get(Number(n));
        if (index !== undefined) found.push({ dir, index });
      });
    };
    for (const m of text.matchAll(/\b(\d{1,2}(?:\s*(?:,|and|&)\s*\d{1,2})*)\s?(across|down|ac|dn)\b/gi)) add(m[1].match(/\d+/g), m[2]);
    for (const m of text.matchAll(/\b(\d{1,2})([ad])\b/gi)) add([m[1]], m[2]);
    return found;
  };
  ["across", "down"].forEach((dir) => puzzle[dir].forEach((clue) => (clue.refs = collect(clue.text))));
}

function fit_grid() {
  if (!puzzle) return;
  const wrap = $("grid-wrap");
  const size = Math.min(wrap.clientWidth, (wrap.clientHeight * puzzle.width) / puzzle.height);
  $("grid").style.width = `${Math.max(0, Math.floor(size) - 2)}px`;
}

function render() {
  const word = current_clue().cells;
  const refs = current_clue().refs;
  const ref_cells = new Set(refs.flatMap((r) => puzzle[r.dir][r.index].cells));
  const ref_keys = refs.map((r) => `${r.dir}${r.index}`);
  const active = { across: clue_of[cursor].across, down: clue_of[cursor].down };
  cell_els.forEach((cell, i) => {
    if (puzzle.cells[i] === null) return;
    letter_els[i].textContent = entries[i];
    const bad = wrong.has(i) || (auto_check && entries[i] && entries[i] !== puzzle.cells[i]);
    cell.classList.toggle("active", i === cursor);
    cell.classList.toggle("in-word", i !== cursor && word.includes(i));
    cell.classList.toggle("ref", ref_cells.has(i));
    cell.classList.toggle("wrong", Boolean(bad));
  });
  ["across", "down"].forEach((dir) =>
    clue_els[dir].forEach((item, index) => {
      item.classList.toggle("active", dir === direction && index === active[dir]);
      item.classList.toggle("cross", dir !== direction && index === active[dir]);
      item.classList.toggle("ref", ref_keys.includes(`${dir}${index}`));
    })
  );
  const clue = current_clue();
  $("current-clue").textContent = `${clue.number}${direction === "across" ? "a" : "d"}  ${clue.text}`;
  const solved = fillable().every((i) => entries[i] === puzzle.cells[i]);
  $("title").textContent = puzzle.title || name;
  $("title").classList.toggle("solved", solved);
  $("status").textContent = solved ? "Solved." : "";
  const list_item = clue_els[direction][active[direction]];
  list_item?.scrollIntoView({ block: "nearest" });
}

function click_cell(i) {
  if (i === cursor) direction = other[direction];
  else cursor = i;
  if (!has_clue(cursor, direction)) direction = other[direction];
  $("keys").focus();
  render();
}

function go_to_clue(dir, index) {
  const list = puzzle[dir];
  const clue = list[(index + list.length) % list.length];
  direction = dir;
  cursor = clue.cells.find((i) => !entries[i]) ?? clue.cells[0];
}

function go_to_next_clue(dir, index) {
  if (index >= puzzle[dir].length) go_to_clue(other[dir], 0);
  else go_to_clue(dir, index);
}

function select_clue(dir, index) {
  go_to_clue(dir, index);
  $("keys").focus();
  render();
}

function step_in_word(step) {
  const cells = current_clue().cells;
  const next = cells.indexOf(cursor) + step;
  if (next >= 0 && next < cells.length) cursor = cells[next];
}

function move_arrow(dr, dc, dir) {
  if (dir !== direction && has_clue(cursor, dir)) {
    direction = dir;
    return;
  }
  let r = Math.floor(cursor / puzzle.width) + dr;
  let c = (cursor % puzzle.width) + dc;
  const inside = () => r >= 0 && c >= 0 && r < puzzle.height && c < puzzle.width;
  while (inside() && puzzle.cells[r * puzzle.width + c] === null) {
    r += dr;
    c += dc;
  }
  if (inside()) cursor = r * puzzle.width + c;
  if (!has_clue(cursor, direction)) direction = other[direction];
}

function type_letter(letter) {
  entries[cursor] = letter;
  wrong.delete(cursor);
  const cells = current_clue().cells;
  const from = cells.indexOf(cursor);
  const next_empty = cells.slice(from + 1).find((i) => !entries[i]);
  const any_empty = cells.find((i) => !entries[i]);
  if (next_empty !== undefined) cursor = next_empty;
  else if (any_empty !== undefined) cursor = any_empty;
  else if (from < cells.length - 1) cursor = cells[from + 1];
  else go_to_next_clue(direction, clue_of[cursor][direction] + 1);
}

function backspace() {
  if (!entries[cursor]) step_in_word(-1);
  entries[cursor] = "";
  wrong.delete(cursor);
}

function on_key(event) {
  if (!puzzle || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.activeElement !== $("keys")) $("keys").focus();
  const key = event.key;
  if (arrows[key]) move_arrow(...arrows[key]);
  else if (key === "Backspace") backspace();
  else if (key === " ") direction = has_clue(cursor, other[direction]) ? other[direction] : direction;
  else if (key === "Tab") {
    const index = clue_of[cursor][direction] + (event.shiftKey ? -1 : 1);
    const list = puzzle[direction];
    if (index < 0) return select_clue(other[direction], puzzle[other[direction]].length - 1), event.preventDefault();
    if (index >= list.length) return select_clue(other[direction], 0), event.preventDefault();
    select_clue(direction, index);
  } else return;
  event.preventDefault();
  save(progress_key(), entries);
  render();
}

function on_input() {
  const field = $("keys");
  const letter = field.value.slice(-1).toUpperCase();
  field.value = "";
  if (!/^[A-Z]$/.test(letter) || !puzzle) return;
  type_letter(letter);
  save(progress_key(), entries);
  render();
}

async function open_puzzle(key) {
  name = key;
  save("xw_last_puzzle", key);
  build_tabs();
  $("status").textContent = "Loading…";
  try {
    const response = await fetch(puzzles[key].file);
    if (!response.ok) throw new Error(`Could not load ${puzzles[key].file} (${response.status}).`);
    puzzle = parse_puz(await response.arrayBuffer());
  } catch (error) {
    puzzle = null;
    $("status").textContent = error.message;
    return;
  }
  const saved = load(progress_key(), null);
  const size = puzzle.width * puzzle.height;
  entries = Array.isArray(saved) && saved.length === size ? saved : new Array(size).fill("");
  wrong.clear();
  direction = "across";
  build_puzzle();
  build_tools();
  go_to_clue("across", 0);
  render();
}

$("theme").onclick = () => set_theme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
$("keys").addEventListener("input", on_input);
new ResizeObserver(fit_grid).observe($("grid-wrap"));
document.addEventListener("keydown", on_key);
set_theme(load("xw_theme", "dark"));
const last = load("xw_last_puzzle", null);
open_puzzle(last in puzzles ? last : Object.keys(puzzles)[0]);
