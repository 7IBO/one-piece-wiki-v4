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
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
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
 * Câble étroit, en OPTION (`--throttle`).
 *
 * Mesurer sur une fibre ne dit rien — mais brider à 1,6 Mb/s multiplie
 * la durée du relevé par dix, et sur quarante-deux pages ça devient une
 * demi-heure d'attente muette. Les chiffres restent comparables entre
 * deux sites tant qu'on emploie le MÊME réglage des deux côtés, donc le
 * défaut est « sans bridage » et l'option sert quand on veut le detail
 * du ressenti reel.
 */
const THROTTLE = {
  offline: false,
  latency: 60,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

/**
 * `networkidle` ne convient pas a un site commercial : entre les
 * mouchards, les websockets et les sondages, le reseau ne se tait
 * jamais, et l'attente va jusqu'au timeout. On attend le `load`, puis
 * un court repos pour laisser les polices et les images differees se
 * poser.
 */
const NAV_TIMEOUT_MS = 25_000;
const SETTLE_MS = 1500;

/** Les deux commandes qui debloquent le cas « le canal est rompu ». */
const CHROME_PORT_HINT = '  # 1. dans une premiere fenetre PowerShell :\n'
  + '  & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" '
  + '--remote-debugging-port=9222 --headless=new --user-data-dir="$env:TEMP\\ui-research"\n'
  + '  # 2. dans une seconde :\n'
  + '  bun scripts/ui-research.ts --preset speedrun --cdp http://localhost:9222\n';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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
  const throttled = args.includes('--throttle');
  const force = args.includes('--force');
  const cdpAt = args.indexOf('--cdp');
  const cdpUrl = cdpAt === -1 ? null : args[cdpAt + 1] ?? null;
  const urls = [
    ...(preset ?? []),
    ...args.filter((a, i) => a.startsWith('http') && i !== cdpAt + 1),
  ];
  if (urls.length === 0) {
    process.stderr.write(
      'usage: bun scripts/ui-research.ts [--preset speedrun] [<url>…]\n\n'
        + `  --preset speedrun   les ${PRESETS['speedrun']!.length} pages de reference\n`
        + '  --throttle          bride a 1,6 Mb/s (dix fois plus lent)\n'
        + '  --force             refait les releves deja ecrits\n'
        + '  --cdp <url>         s attache a un Chrome deja lance\n'
        + '                      (quand Playwright n arrive pas a en demarrer un)\n'
        + "  bun scripts/ui-research.ts 'https://exemple.com/une-page'\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${urls.length} page(s) x ${VIEWPORTS.length} largeurs = `
      + `${urls.length * VIEWPORTS.length} releves`
      + `${throttled ? ' (bride a 1,6 Mb/s)' : ''}\n`,
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

  /*
   * Le lancement du navigateur, par ordre de fiabilite.
   *
   * Playwright demarre par defaut `chrome-headless-shell`, un binaire
   * distinct du Chromium complet. Sous Windows il lui arrive de
   * DEMARRER puis de ne jamais repondre — le processus existe, la
   * connexion n'aboutit pas, et l'attente va jusqu'au timeout. Un
   * antivirus qui inspecte son canal de communication suffit.
   *
   * Le Chromium complet en mode headless ne souffre pas de ca, pour un
   * cout negligeable a notre echelle. On l'essaie donc en premier, et
   * on retombe sur le comportement par defaut s'il manque.
   *
   * `CHROMIUM_PATH` passe avant tout : dans un conteneur qui fournit
   * deja un binaire sous un autre nom, ca evite d'en retelecharger un.
   */
  let browser;

  /*
   * `--cdp` : on s'ATTACHE a un navigateur deja lance, au lieu d'en
   * demarrer un.
   *
   * C'est l'echappatoire quand Playwright n'arrive pas a parler au
   * navigateur qu'il vient pourtant de demarrer — le processus existe,
   * la connexion n'aboutit jamais. Playwright communique par
   * `--remote-debugging-pipe`, un tuyau herite ; un antivirus ou un EDR
   * qui l'inspecte suffit a le rompre, et le symptome est identique
   * quel que soit le binaire. Un port TCP sur la boucle locale, lui,
   * passe.
   */
  if (cdpUrl !== null) {
    try {
      browser = await chromium.connectOverCDP(cdpUrl, { timeout: 20_000 });
      process.stdout.write(`attache a ${cdpUrl}\n`);
    } catch (err) {
      process.stderr.write(
        `impossible de s attacher a ${cdpUrl} — ${
          err instanceof Error ? err.message.split('\n')[0] : String(err)
        }\n\nLance d abord Chrome avec un port de debogage :\n${CHROME_PORT_HINT}`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    const executablePath = process.env['CHROMIUM_PATH'];
    const attempts = executablePath !== undefined && executablePath !== ''
      ? [{ label: 'CHROMIUM_PATH', opts: { executablePath } }]
      : [
        { label: 'chromium complet', opts: { channel: 'chromium' } },
        { label: 'headless shell', opts: {} },
      ];

    for (const attempt of attempts) {
      try {
        browser = await chromium.launch({ ...attempt.opts, timeout: 60_000 });
        break;
      } catch (err) {
        process.stderr.write(
          `lancement via ${attempt.label} : echec — ${
            err instanceof Error ? err.message.split('\n')[0] : String(err)
          }\n`,
        );
      }
    }
    if (browser === undefined) {
      process.stderr.write(
        '\nAucun navigateur n a demarre.\n\n'
          + 'Si le processus DEMARRE puis ne repond pas, le binaire n est pas'
          + ' en cause : c est le canal.\n'
          + 'Playwright parle au navigateur par un tuyau herite'
          + ' (--remote-debugging-pipe), qu un antivirus\n'
          + 'ou un EDR peut rompre. Lance alors Chrome toi-meme sur un port,'
          + ' et attache-toi :\n\n'
          + CHROME_PORT_HINT,
      );
      process.exitCode = 1;
      return;
    }
  }

  for (const raw of urls) {
    const url = new URL(raw);
    const dir = join(root, url.host, slugOf(url));
    await mkdir(dir, { recursive: true });
    process.stdout.write(`\n${url.href}\n`);

    for (const vp of VIEWPORTS) {
      // Reprise : un relevé deja ecrit n'est pas refait. Une course de
      // quarante-deux pages sera interrompue, et la recommencer depuis
      // zero est le meilleur moyen de ne jamais la finir.
      const jsonPath = join(dir, `${vp.name}.json`);
      if (!force && await exists(jsonPath)) {
        process.stdout.write(`  ${vp.name.padEnd(8)} deja releve\n`);
        continue;
      }

      // Annonce AVANT de commencer : une ligne qui n'arrive qu'apres
      // coup laisse croire que rien ne se passe, ce qui etait le
      // defaut de la premiere version.
      process.stdout.write(`  ${vp.name.padEnd(8)} …`);
      const started = Date.now();

      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (throttled) await cdp.send('Network.emulateNetworkConditions', THROTTLE);

      let timedOut = false;
      try {
        await page.goto(url.href, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
      } catch {
        timedOut = true;
      }
      // Laisse les polices et les images differees se poser.
      await page.waitForTimeout(SETTLE_MS);

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

      // Un echec de chargement ne laisse RIEN derriere lui.
      //
      // Sans ce garde, le script ecrivait un releve de la page d'erreur
      // du navigateur — une requete, zero octet, « This site can't be
      // reached » en h1 — et la reprise le sautait ensuite pour
      // toujours. Une panne passagere devenait un trou permanent qu'il
      // fallait `--force` pour combler.
      if (report.perf.requests <= 1 && report.perf.docKb === 0) {
        await rm(join(dir, `${vp.name}.png`), { force: true });
        process.stdout.write(
          `\r  ${vp.name.padEnd(8)} ECHEC — page non chargee, releve non ecrit\n`,
        );
        await ctx.close();
        continue;
      }

      await writeFile(
        jsonPath,
        `${JSON.stringify(report, null, 2)}\n`,
      );
      process.stdout.write(
        `\r  ${vp.name.padEnd(8)} FCP ${String(report.perf.fcp).padStart(5)} ms  `
          + `${String(report.perf.totalKb).padStart(8)} Ko  `
          + `${String(report.perf.requests).padStart(3)} req  `
          + `div/sem ${String(report.markup.ratio).padStart(5)}  `
          + `${((Date.now() - started) / 1000).toFixed(1)}s`
          + `${timedOut ? '  (charge partielle)' : ''}\n`,
      );
      await ctx.close();
    }
  }

  await browser.close();
  process.stdout.write(`\nRelevé écrit dans ${root}/\n`);
}

await main();
