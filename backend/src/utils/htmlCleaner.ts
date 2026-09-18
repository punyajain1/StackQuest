import * as cheerio from 'cheerio';

export function cleanHtml(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  
  // Extract text, preserving some whitespace structure if necessary
  // cheerio's .text() already does a decent job
  let text = $.text();
  
  // Collapse multiple newlines/spaces
  text = text.replace(/\n\s*\n/g, '\n\n').trim();
  
  return text;
}
