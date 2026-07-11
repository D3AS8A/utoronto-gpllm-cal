import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode } from '@toon-format/toon';

export interface GlobalContent {
  name: string;
  tagline: string;
  description: string;
  url: string;
  title_postfix: string;
  og_image: string;
}

export interface PageMeta {
  title: string | null;
  description: string;
  og_image: string;
}

export interface PageOptions {
  noindex?: boolean;
}

export interface PageContent<C = Record<string, unknown>> {
  meta: PageMeta;
  options: PageOptions | null;
  content: C;
}

function readToon(filename: string): string {
  return readFileSync(join(process.cwd(), 'src/content', filename), 'utf-8');
}

export function loadGlobal(): GlobalContent {
  return decode(readToon('global.toon')) as unknown as GlobalContent;
}

export function loadPage<C = Record<string, unknown>>(name: string): PageContent<C> {
  return decode(readToon(`${name}.toon`)) as unknown as PageContent<C>;
}
