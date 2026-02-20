// Minimal browser-compatible YAML front matter parser/serializer.
// Handles flat key-value pairs and the special `signatures` array.

export interface ParsedFrontMatter {
  data: Record<string, unknown>;
  content: string;
}

interface SignatureEntry {
  keyId: string;
  publisher: string;
  value: string;
}

export function parse(raw: string): ParsedFrontMatter {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const yaml = match[1];
  const content = match[2];
  const data: Record<string, unknown> = {};

  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 1) { i++; continue; }

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();

    // Detect YAML list: "signatures:" with empty value, followed by "  - keyId: ..."
    if (key === "signatures" && rest === "") {
      const entries: SignatureEntry[] = [];
      i++;
      while (i < lines.length) {
        const listLine = lines[i];
        if (!listLine || (!listLine.startsWith("  ") && !listLine.startsWith("\t"))) break;
        const lt = listLine.trim();
        if (lt.startsWith("- keyId:")) {
          const entry: Partial<SignatureEntry> = {};
          entry.keyId = String(parseInlineValue(lt.slice("- keyId:".length).trim()));
          i++;
          while (i < lines.length) {
            const nextLine = lines[i].trim();
            if (nextLine.startsWith("publisher:")) {
              entry.publisher = String(parseInlineValue(nextLine.slice("publisher:".length).trim()));
              i++;
            } else if (nextLine.startsWith("value:")) {
              entry.value = String(parseInlineValue(nextLine.slice("value:".length).trim()));
              i++;
            } else {
              break;
            }
          }
          if (entry.keyId !== undefined && entry.publisher !== undefined && entry.value !== undefined) {
            entries.push(entry as SignatureEntry);
          }
        } else {
          i++;
        }
      }
      data[key] = entries;
      continue;
    }

    data[key] = parseInlineValue(rest);
    i++;
  }

  return { data, content };
}

function parseInlineValue(raw: string): string | boolean | number {
  let value: string | boolean | number = raw;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  } else if (value === "true") {
    value = true;
  } else if (value === "false") {
    value = false;
  } else if (value !== "" && !Number.isNaN(Number(value))) {
    if (!/^0\d/.test(value) && !/^\d+\.\d+\.\d+/.test(value)) {
      value = Number(value);
    }
  }
  return value;
}

function yamlValue(v: unknown): string {
  if (typeof v === "string") {
    if (v.includes(":") || v.includes("#") || v.includes('"') || v.includes("'") || /^\d/.test(v)) {
      return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return v;
  }
  return String(v);
}

export function stringify(content: string, data: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (key === "signatures" && Array.isArray(value)) {
      lines.push("signatures:");
      for (const entry of value as SignatureEntry[]) {
        lines.push(`  - keyId: ${yamlValue(entry.keyId)}`);
        lines.push(`    publisher: ${yamlValue(entry.publisher)}`);
        lines.push(`    value: ${yamlValue(entry.value)}`);
      }
      continue;
    }
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  lines.push("---");
  return lines.join("\n") + "\n" + content;
}
