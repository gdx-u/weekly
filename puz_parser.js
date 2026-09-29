const decoder = new TextDecoder("latin1");

function region_checksum(codes) {
  let sum = 0;
  for (const code of codes) {
    sum = sum & 1 ? (sum >> 1) | 0x8000 : sum >> 1;
    sum = (sum + code) & 0xffff;
  }
  return sum;
}

function unscramble(values, digits) {
  let s = values;
  const len = s.length;
  for (const k of [...digits].reverse()) {
    s = [...s.filter((_, i) => i % 2 === 1), ...s.filter((_, i) => i % 2 === 0)];
    s = [...s.slice(len - k), ...s.slice(0, len - k)];
    s = s.map((v, i) => (v - digits[i % 4] + 26) % 26);
  }
  return s;
}

function unlock(cells, width, height, expected) {
  const order = [];
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < height; r++) {
      if (cells[r * width + c] !== null) order.push(r * width + c);
    }
  }
  const values = order.map((i) => cells[i].charCodeAt(0) - 65);
  for (let key = 1000; key <= 9999; key++) {
    const digits = String(key).split("").map(Number);
    if (digits.includes(0)) continue;
    const result = unscramble(values, digits);
    if (region_checksum(result.map((v) => v + 65)) === expected) {
      const unlocked = [...cells];
      order.forEach((cell, n) => (unlocked[cell] = String.fromCharCode(result[n] + 65)));
      return unlocked;
    }
  }
  throw new Error("Could not unlock this scrambled puzzle.");
}

export function parse_puz(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const magic = decoder.decode(bytes.slice(2, 13));
  if (magic !== "ACROSS&DOWN") throw new Error("Not a valid .puz file.");

  const width = bytes[0x2c];
  const height = bytes[0x2d];
  const clue_count = view.getUint16(0x2e, true);
  const scrambled = view.getUint16(0x32, true) !== 0;
  const size = width * height;

  let cells = Array.from(bytes.slice(0x34, 0x34 + size), (b) => (b === 46 ? null : String.fromCharCode(b)));
  if (scrambled) cells = unlock(cells, width, height, view.getUint16(0x1e, true));

  let pos = 0x34 + size * 2;
  const read_string = () => {
    let end = pos;
    while (end < bytes.length && bytes[end] !== 0) end++;
    const text = decoder.decode(bytes.slice(pos, end));
    pos = end + 1;
    return text;
  };
  const title = read_string();
  const author = read_string();
  read_string();
  const raw_clues = Array.from({ length: clue_count }, () => read_string());

  const is_open = (r, c) => r >= 0 && c >= 0 && r < height && c < width && cells[r * width + c] !== null;
  const walk = (r, c, dr, dc) => {
    const run = [];
    while (is_open(r, c)) {
      run.push(r * width + c);
      r += dr;
      c += dc;
    }
    return run;
  };

  const numbers = new Array(size).fill(0);
  const across = [];
  const down = [];
  let number = 0;
  let next_clue = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!is_open(r, c)) continue;
      const starts_across = !is_open(r, c - 1) && is_open(r, c + 1);
      const starts_down = !is_open(r - 1, c) && is_open(r + 1, c);
      if (!starts_across && !starts_down) continue;
      numbers[r * width + c] = ++number;
      if (starts_across) across.push({ number, text: raw_clues[next_clue++], cells: walk(r, c, 0, 1) });
      if (starts_down) down.push({ number, text: raw_clues[next_clue++], cells: walk(r, c, 1, 0) });
    }
  }

  return { title, author, width, height, cells, numbers, across, down };
}
