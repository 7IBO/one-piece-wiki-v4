/**
 * Relève d'UI sur des sites de référence — à lancer DEPUIS UNE MACHINE
 * QUI A UN ACCÈS RÉSEAU NORMAL.
 *
 *   bun scripts/ui-research.ts <url> [<url>…]
 *
 * Le bac à sable de l'agent passe par une passerelle qui refuse tout
 * hôte non autorisé (403 sur le CONNECT), donc speedrun.com et Fandom
 * y sont injoignables. Les runners CI, eux, ont un egress normal — et
 * ta machine aussi. Ce script existe pour que la relève se fasse là où
 * le réseau existe, et que l'analyse se fasse ici sur son résultat.
 *
 * Ce qu'il capture, et ce qu'il ne capture pas
 * -------------------------------------------
 * Il relève la STRUCTURE et les MESURES : arbre des titres, repères
 * ARIA, squelette des sections (balise + rôle + classes, sans le
 * texte), piles de polices réellement calculées, variables CSS de
 * `:root`, couleurs effectivement peintes, poids et cascade réseau.
 *
 * Il ne verse PAS le HTML complet des pages. Des captures et des
 * mesures pour se comparer sont l'usage normal ; recopier les pages
 * d'un site tiers dans un dépôt est autre chose. Les captures d'écran
 * restent hors de git (`.cache/`).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Les archétypes de page de speedrun.com, parce que « plein de pages »
 * ne veut rien dire si elles se ressemblent toutes.
 *
 * Chacune répond à une question qu'on se pose sur NOTRE site :
 *  - une liste à facettes (leur page « games » ↔ nos pages de type) ;
 *  - une fiche dense avec classement (une page de jeu ↔ nos fiches) ;
 *  - une collection groupée (une série ↔ nos arcs et sagas) ;
 *  - la communauté (forums, fils) ↔ le panneau qu'on a retiré ;
 *  - un profil (collection personnelle) ↔ notre progression ;
 *  - la recherche, l'accueil, une page de détail terminale.
 */
const PRESETS: Readonly<Record<string, readonly string[]>> = {
  speedrun: [
    'https://www.speedrun.com/',
    'https://www.speedrun.com/games',
    'https://www.speedrun.com/series',
    'https://www.speedrun.com/smb1',
    'https://www.speedrun.com/smb1/full_game',
    'https://www.speedrun.com/smb1/levels',
    'https://www.speedrun.com/smb1/forums',
    'https://www.speedrun.com/smb1/resources',
    'https://www.speedrun.com/smb1/guides',
    'https://www.speedrun.com/smb1/statistics',
    'https://www.speedrun.com/mario',
    'https://www.speedrun.com/forums',
    'https://www.speedrun.com/news',
    'https://www.speedrun.com/streams',
  ],
};

/** Les trois largeurs qui décident vraiment d'une mise en page. */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

/**
 * Câble volontairement étroit. Mesurer sur une fibre ne dit rien : tout
 * y est instantané, y compris ce qui ne l'est pas chez un lecteur.
 */
const THROTTLE = {
  offline: false,
  latency: 60,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

function slugOf(url: URL): string {
  const path = url.pathname.replace(/^\/|\/$/g, '') || 'index';
  return path.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const presetAt = args.indexOf('--preset');
  const presetName = presetAt === -1 ? null : args[presetAt + 1] ?? null;
  const preset = presetName === null ? null : PRESETS[presetName] ?? null;
  if (presetName !== null && preset === null) {
    process.stderr.write(
      `preset inconnu : ${presetName}. Connus : ${Object.keys(PRESETS).join(', ')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const urls = [...(preset ?? []), ...args.filter((a) => a.startsWith('http'))];
  if (urls.length === 0) {
    process.stderr.write(
      'usage: bun scripts/ui-research.ts [--preset speedrun] [<url>…]\n\n'
        + `  --preset speedrun   les ${PRESETS['speedrun']!.length} pages de reference\n`
        + "  bun scripts/ui-research.ts 'https://exemple.com/une-page'\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${urls.length} page(s) x ${VIEWPORTS.length} largeurs = `
      + `${urls.length * VIEWPORTS.length} releves\n`,
  );

  // Import dynamique : Playwright n'est pas une dependance declaree du
  // depot, `bun` le recupere a la volee. Le message d'erreur vaut mieux
  // qu'une trace de module introuvable.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    process.stderr.write(
      'Playwright manque. Lance : bunx playwright install chromium\n',
    );
    process.exitCode = 1;
    return;
  }

  const root = join('.cache', 'ui-research');
  // Sur une machine ordinaire, Playwright trouve son Chromium tout
  // seul. Dans un conteneur qui en fournit deja un sous un autre nom,
  // `CHROMIUM_PATH` evite de retelecharger 150 Mo pour rien.
  const executablePath = process.env['CHROMIUM_PATH'];
  const browser = await chromium.launch(
    executablePath === undefined || executablePath === '' ? {} : { executablePath },
  );

  for (const raw of urls) {
    const url = new URL(raw);
    const dir = join(root, url.host, slugOf(url));
    await mkdir(dir, { recursive: true });
    process.stdout.write(`\n${url.href}\n`);

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', THROTTLE);

      try {
        await page.goto(url.href, { waitUntil: 'networkidle', timeout: 60_000 });
      } catch {
        process.stdout.write(`  ${vp.name}: chargement trop long, on continue\n`);
      }
      // Laisse les polices et les images differees se poser.
      await page.waitForTimeout(1200);

      await page.screenshot({
        path: join(dir, `${vp.name}.png`),
        fullPage: true,
      });

      const report = await page.evaluate(() => {
        const seen = new Set<string>();
        const push = (s: string): void => void seen.add(s);

        // Arbre des titres : la colonne vertebrale d'une page, et le
        // premier endroit ou une structure bâclee se voit.
        const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => ({
          level: Number(h.tagName[1]),
          text: (h.textContent ?? '').trim().slice(0, 80),
        }));

        // Reperes ARIA + elements de sectionnement : dit si la page est
        // construite en HTML ou en soupe de <div>.
        const landmarks = [...document.querySelectorAll(
          'header,nav,main,aside,footer,section,article,[role]',
        )].slice(0, 120).map((el) => ({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          label: el.getAttribute('aria-label')?.slice(0, 40) ?? null,
        }));

        const divs = document.querySelectorAll('div').length;
        const semantic = document.querySelectorAll(
          'header,nav,main,aside,footer,section,article,figure,ul,ol,dl,table',
        ).length;

        // Polices REELLEMENT calculees, par rôle visible.
        const familyOf = (sel: string): string | null => {
          const el = document.querySelector(sel);
          return el === null ? null : getComputedStyle(el).fontFamily;
        };
        const fonts = {
          body: familyOf('body'),
          h1: familyOf('h1'),
          h2: familyOf('h2'),
          button: familyOf('button'),
          loaded: [...document.fonts]
            .filter((f) => f.status === 'loaded')
            .map((f) => `${f.family} ${f.style} ${f.weight}`),
        };

        // Variables CSS de :root — le systeme de design, quand il en
        // existe un.
        const tokens: Record<string, string> = {};
        for (const sheet of document.styleSheets) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue; // feuille d'une autre origine
          }
          for (const rule of rules) {
            if (!(rule instanceof CSSStyleRule)) continue;
            if (!/^:root\b|^html\b/.test(rule.selectorText)) continue;
            for (const prop of rule.style) {
              if (prop.startsWith('--')) tokens[prop] = rule.style.getPropertyValue(prop).trim();
            }
          }
        }

        // Couleurs effectivement peintes sur les 400 premiers elements :
        // dit combien de teintes la page emploie vraiment.
        for (const el of [...document.querySelectorAll('*')].slice(0, 400)) {
          const cs = getComputedStyle(el);
          push(cs.color);
          if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') push(cs.backgroundColor);
        }

        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const byType: Record<string, { count: number; kb: number; }> = {};
        for (const r of res) {
          const k = r.initiatorType || 'other';
          byType[k] ??= { count: 0, kb: 0 };
          byType[k].count += 1;
          byType[k].kb += r.transferSize / 1024;
        }
        for (const k of Object.keys(byType)) byType[k]!.kb = +byType[k]!.kb.toFixed(1);

        return {
          title: document.title,
          headings,
          landmarks,
          markup: { divs, semantic, ratio: +(divs / Math.max(1, semantic)).toFixed(1) },
          fonts,
          tokens,
          colors: [...seen].slice(0, 60),
          perf: {
            fcp: +(performance.getEntriesByType('paint')
              .find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0).toFixed(0),
            domInteractive: +nav.domInteractive.toFixed(0),
            loadEnd: +nav.loadEventEnd.toFixed(0),
            docKb: +(nav.transferSize / 1024).toFixed(1),
            requests: res.length + 1,
            totalKb: +(res.reduce((s, r) => s + r.transferSize, 0) / 1024
              + nav.transferSize / 1024).toFixed(1),
            byType,
          },
        };
      });

      await writeFile(
        join(dir, `${vp.name}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      process.stdout.write(
        `  ${vp.name.padEnd(8)} FCP ${String(report.perf.fcp).padStart(5)} ms  `
          + `${String(report.perf.totalKb).padStart(7)} Ko  `
          + `${String(report.perf.requests).padStart(3)} req  `
          + `div/semantique ${report.markup.ratio}\n`,
      );
      await ctx.close();
    }
  }

  await browser.close();
  process.stdout.write(`\nRelevé écrit dans ${root}/\n`);
}

await main();
