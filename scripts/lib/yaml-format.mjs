// YAML output matching Sveltia CMS (plain strings, quotes only when needed, single quotes preferred).
import { stringify } from 'yaml';

export const yamlOptions = {
  indent: 2,
  indentSeq: true,
  lineWidth: 0,
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
  singleQuote: true,
};

export const toYaml = (data) => stringify(data, yamlOptions).trim();

// Markdown file with YAML frontmatter, laid out like Sveltia: "---\n<yaml>\n---\n\n<body>\n".
export const toFrontmatter = (data, body) => `---\n${toYaml(data)}\n---\n\n${body.trim()}\n`;
