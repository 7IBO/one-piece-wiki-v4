import type { Locale } from '@onepiece-wiki/schemas';
import {
  type Client,
  type EntityRecord,
  type PropertyRecord,
  type RelationRecord,
  visibleProperties,
  visibleRelations,
} from '@onepiece-wiki/sdk';
import { html, htmlPage, raw, type SafeHtml } from './html.ts';
import { fallbackKey } from './labels.ts';

export type ViewContext = {
  readonly locale: Locale;
  readonly progression: { manga_chapter: number; };
};

function header(ctx: ViewContext): SafeHtml {
  return html`
    <header>
      <h1><a href="/">One Piece Wiki preview</a></h1>
      <form action="" method="get">
        <label>chapter
          <input type="number" name="chapter" value="${ctx.progression.manga_chapter}" min="0">
        </label>
        <label>locale
          <select name="locale">
            <option value="en"${ctx.locale === 'en' ? raw(' selected') : ''}>EN</option>
            <option value="fr"${ctx.locale === 'fr' ? raw(' selected') : ''}>FR</option>
          </select>
        </label>
        <button type="submit">apply</button>
      </form>
    </header>
  `;
}

export function renderIndex(client: Client, ctx: ViewContext): string {
  const types: readonly string[] = [
    'character',
    'devil-fruit',
    'crew',
    'arc',
    'event',
    'manga-chapter',
    'image',
  ];

  const sections = types.map((type) => {
    const list = client.getByType(type);
    return html`
      <section>
        <h2>${type} <span class="muted">(${list.length})</span></h2>
        <ul>
          ${list.map((e) => html`<li><a href="/preview/${e.type}/${e.slug}">${e.slug}</a></li>`)}
        </ul>
      </section>
    `;
  });

  return htmlPage(
    'index',
    html`${header(ctx)}<main>${sections}</main>`,
  );
}

function badge(text: string, kind?: 'warn' | 'inferred'): SafeHtml {
  const cls = kind === 'warn'
    ? 'badge badge--warn'
    : kind === 'inferred'
    ? 'badge badge--inferred'
    : 'badge';
  return html`<span class="${cls}">${text}</span>`;
}

function renderPropertyValue(record: PropertyRecord): SafeHtml {
  const value = record.value as Record<string, unknown>;
  if (typeof value['value_key'] === 'string') {
    return html`<code>${value['value_key']}</code> <span class="muted">(${
      fallbackKey(value['value_key'] as string)
    })</span>`;
  }
  if ('value' in value) {
    return html`<code>${JSON.stringify(value['value'])}</code>`;
  }
  return html`<code>${JSON.stringify(value)}</code>`;
}

function renderPropertyRows(
  properties: readonly PropertyRecord[],
): SafeHtml {
  if (properties.length === 0) return html`<p class="empty">No reachable properties.</p>`;

  const grouped = new Map<string, PropertyRecord[]>();
  for (const p of properties) {
    const existing = grouped.get(p.property_id);
    if (existing === undefined) {
      grouped.set(p.property_id, [p]);
    } else {
      existing.push(p);
    }
  }

  const rows: SafeHtml[] = [];
  for (const [propertyId, entries] of grouped) {
    for (const [i, entry] of entries.entries()) {
      const ep = entry.epistemic_status !== 'true' ? badge(entry.epistemic_status, 'warn') : '';
      const rev = entry.review_status !== 'reviewed' ? badge(entry.review_status, 'warn') : '';
      const ai = entry.assisted_by !== null ? badge(`AI: ${entry.assisted_by}`, 'inferred') : '';
      rows.push(html`
        <tr>
          <td>${i === 0 ? raw(`<code>${propertyId}</code>`) : ''}</td>
          <td>${renderPropertyValue(entry)} ${ep}${rev}${ai}</td>
          <td class="muted">${entry.since_source ?? ''}</td>
        </tr>
      `);
    }
  }

  return html`
    <table>
      <thead><tr><th>property</th><th>value</th><th>since</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRelations(
  relations: readonly RelationRecord[],
): SafeHtml {
  if (relations.length === 0) return html`<p class="empty">No reachable relations.</p>`;
  return html`
    <table>
      <thead>
        <tr><th>relation</th><th>target</th><th>qualifiers</th><th></th></tr>
      </thead>
      <tbody>
        ${
    relations.map((r) =>
      html`
            <tr>
              <td><code>${r.relation_type}</code></td>
              <td>
                <a href="/preview/${r.target_entity_id.split(':')[0] ?? ''}/${
        r.target_entity_id.split(':')[1] ?? ''
      }">${r.target_entity_id}</a>
              </td>
              <td class="muted">${r.qualifiers !== null ? JSON.stringify(r.qualifiers) : ''}</td>
              <td>${r.is_inferred ? badge('inferred', 'inferred') : ''}</td>
            </tr>
          `
    )
  }
      </tbody>
    </table>
  `;
}

export function renderType(client: Client, type: string, ctx: ViewContext): string | null {
  const list = client.getByType(type);
  if (list.length === 0) return null;
  return htmlPage(
    type,
    html`${header(ctx)}<main>
      <h2>${type} <span class="muted">(${list.length})</span></h2>
      <ul>
        ${list.map((e) => html`<li><a href="/preview/${type}/${e.slug}">${e.slug}</a></li>`)}
      </ul>
    </main>`,
  );
}

export function renderEntity(
  client: Client,
  entity: EntityRecord,
  ctx: ViewContext,
): string {
  const allProperties = client.getProperties(entity.id);
  const allOutgoing = client.getRelations(entity.id, 'outgoing');
  const allIncoming = client.getRelations(entity.id, 'incoming');

  const visibleProps = visibleProperties(allProperties, ctx.progression);
  const visibleOut = visibleRelations(allOutgoing, ctx.progression);
  const visibleIn = visibleRelations(allIncoming, ctx.progression);

  const visiblePropIds = new Set(visibleProps.map((p) => p.property_id));
  const visiblePropertyHistory = allProperties.filter((p) => visiblePropIds.has(p.property_id));

  return htmlPage(
    entity.id,
    html`${header(ctx)}<main>
      <h2>${entity.id}</h2>
      <p class="muted">
        type=<code>${entity.type}</code>
        slug=<code>${entity.slug}</code>
        canonical_name_key=<code>${entity.canonical_name_key ?? '(none)'}</code>
      </p>
      <p class="muted">
        first_appearance=<code>${entity.first_appearance_source ?? '(none)'}</code>
        last_appearance=<code>${entity.last_appearance_source ?? '(none)'}</code>
      </p>

      <h2>Properties (visible)</h2>
      ${renderPropertyRows(visibleProps)}

      <h2>Properties (full historisation)</h2>
      ${renderPropertyRows(visiblePropertyHistory)}

      <h2>Relations (outgoing, reachable)</h2>
      ${renderRelations(visibleOut)}

      <h2>Relations (incoming, reachable)</h2>
      ${renderRelations(visibleIn)}
    </main>`,
  );
}

export function renderNotFound(ctx: ViewContext): string {
  return htmlPage(
    'not found',
    html`${header(ctx)}<main><h2>Not found</h2><p>No entity at this path.</p></main>`,
  );
}
