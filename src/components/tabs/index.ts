import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { TAB_IDS } from '@/constants/tabs';

/**
 * Tab id → component. Every tool is lazily loaded, so a tool's parser only
 * reaches the browser when that tool is opened.
 *
 * Ids not listed in IMPLEMENTED fall back to the placeholder until their phase.
 */
const PlaceholderTab = lazy(() =>
  import('./PlaceholderTab').then((m) => ({ default: m.PlaceholderTab })),
);

const IMPLEMENTED: Record<string, LazyExoticComponent<ComponentType>> = {
  graphql: lazy(() => import('./GraphQLTab').then((m) => ({ default: m.GraphQLTab }))),
  json: lazy(() => import('./JSONTab').then((m) => ({ default: m.JSONTab }))),
  diff: lazy(() => import('./DiffTab').then((m) => ({ default: m.DiffTab }))),
  curl: lazy(() => import('./CurlTab').then((m) => ({ default: m.CurlTab }))),
  jsontype: lazy(() => import('./JsonToTypeTab').then((m) => ({ default: m.JsonToTypeTab }))),
  yaml: lazy(() => import('./YamlTab').then((m) => ({ default: m.YamlTab }))),
  sql: lazy(() => import('./SqlTab').then((m) => ({ default: m.SqlTab }))),
  xml: lazy(() => import('./XMLTab').then((m) => ({ default: m.XMLTab }))),
  url: lazy(() => import('./UrlTab').then((m) => ({ default: m.UrlTab }))),
  jwt: lazy(() => import('./JWTTab').then((m) => ({ default: m.JWTTab }))),
  base64: lazy(() => import('./Base64Tab').then((m) => ({ default: m.Base64Tab }))),
  hash: lazy(() => import('./HashTab').then((m) => ({ default: m.HashTab }))),
  uuid: lazy(() => import('./UuidTab').then((m) => ({ default: m.UuidTab }))),
  mockdata: lazy(() => import('./MockDataTab').then((m) => ({ default: m.MockDataTab }))),
  csv: lazy(() => import('./CSVTab').then((m) => ({ default: m.CSVTab }))),
  markdown: lazy(() => import('./MarkdownTab').then((m) => ({ default: m.MarkdownTab }))),
  mapper: lazy(() => import('./MapperTab').then((m) => ({ default: m.MapperTab }))),
  history: lazy(() => import('./HistoryTab').then((m) => ({ default: m.HistoryTab }))),
  regex: lazy(() => import('./RegexTab').then((m) => ({ default: m.RegexTab }))),
  timestamp: lazy(() => import('./TimestampTab').then((m) => ({ default: m.TimestampTab }))),
  textcase: lazy(() => import('./TextCaseTab').then((m) => ({ default: m.TextCaseTab }))),
  color: lazy(() => import('./ColorTab').then((m) => ({ default: m.ColorTab }))),
  cron: lazy(() => import('./CronTab').then((m) => ({ default: m.CronTab }))),
};

export const TAB_COMPONENTS: Readonly<Record<string, LazyExoticComponent<ComponentType>>> =
  Object.fromEntries(TAB_IDS.map((id) => [id, IMPLEMENTED[id] ?? PlaceholderTab]));
