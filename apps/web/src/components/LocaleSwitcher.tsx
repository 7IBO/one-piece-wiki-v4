/**
 * Le sélecteur de langue, comme le manifeste `design/v2` le décrit :
 * « LANGUE dans l'en-tête : liste maison, pas un <select> natif,
 * montrée ouverte sur la planche Personnage. La courante en or avec sa
 * coche. »
 *
 * L'itération précédente était une BASCULE : une seule langue affichée,
 * cliquer passait à la suivante. Divergence assumée à l'époque — à deux
 * langues, un menu coûte un clic pour rien — et refusée depuis. Elle
 * avait un vrai défaut au-delà du goût : rien n'annonçait ce qui allait
 * se passer. Le libellé disait « Français », le caret suggérait un
 * menu, et le clic changeait la langue sans jamais montrer les choix.
 *
 * Valeurs lues dans `Main.dc.html` : déclencheur `11.5px` avec un caret
 * `9px`, liste de `158px` bordée `#2c3038` à `6px` de rayon sur fond
 * `#14171d`, `5px` de marge intérieure, lignes `12.5px` en `7px 9px`,
 * la courante sur `#1c2027` à `4px` de rayon, en or, avec sa coche.
 *
 * La liste est bâtie depuis `SUPPORTED_LOCALES`, donc une troisième
 * langue apparaît sans toucher à ce fichier — la planche en montre
 * cinq, le corpus en porte deux.
 */
import { Menu } from '@base-ui/react/menu';
import { type ReactElement } from 'react';
import { type Locale, SUPPORTED_LOCALES, t } from '../lib/chrome';
import { LOCALE_COOKIE, useLocale } from '../routes/__root';

/** Chaque langue nommée dans sa propre langue, comme la planche. */
const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  fr: 'Français',
};

export function LocaleSwitcher(): ReactElement {
  const locale = useLocale();

  /**
   * Changer de langue arrivait EN DEUX TEMPS, et c'était mesurable :
   * les chaînes fixes du front basculaient à **117 ms**, les données du
   * wiki à **459 ms** — 342 ms d'en-tête « MA PROGRESSION » au-dessus
   * d'une page encore anglaise.
   *
   * La cause est structurelle. `router.invalidate()` rejoue le
   * `beforeLoad` de la racine ET les loaders de route. Le premier
   * résout la locale en lisant un cookie : c'est local, donc immédiat.
   * Les seconds sont des fonctions serveur : c'est un aller-retour.
   * React commite le premier sans attendre les seconds.
   *
   * Deux tentatives, mesurées, qui n'y changent rien :
   *
   * - `startTransition` autour de l'invalidation — l'écart reste à
   *   343 ms. L'invalidation met à jour l'état du routeur sur
   *   plusieurs ticks ; la transition ne couvre pas le second.
   * - faire passer le chrome par le serveur lui aussi, pour qu'il
   *   franchisse la même frontière asynchrone — 351 ms. Les deux
   *   loaders partent ensemble mais n'arrivent pas ensemble (le chrome
   *   met ~50 ms, la page ~340), et le routeur commite chacun à son
   *   arrivée.
   *
   * Reste le rechargement du document. Le serveur rend la page entière
   * dans la nouvelle langue en UNE passe, donc il n'y a pas d'état
   * intermédiaire du tout : mesuré, 0 échantillon mixte sur 21 pendant
   * la bascule, contre un demi-écran de français sur une page anglaise
   * avant. Il coûte 592 ms au lieu de 459 — 133 ms de plus pour ne
   * jamais montrer une page à moitié traduite.
   */
  const apply = (next: Locale): void => {
    if (next === locale) return;
    // Un seul petit cookie propriétaire ; l'API Cookie Store
    // asynchrone n'est pas universelle et une bibliothèque serait
    // disproportionnée pour une écriture.
    // oxlint-disable-next-line unicorn/no-document-cookie
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // Un RECHARGEMENT, pas une invalidation. Voir le commentaire
    // ci-dessus : le serveur rend la page entiere dans la nouvelle
    // langue en une passe, donc tout arrive ensemble.
    window.location.reload();
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t(locale, 'languageLabel')}
        className='flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-[11.5px] text-[color:var(--color-muted)] transition-colors duration-150 hover:text-fg'
      >
        {LANGUAGE_NAMES[locale]}
        <span aria-hidden className='text-[9px] text-faint'>▾</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side='bottom' align='end' sideOffset={6}>
          <Menu.Popup className='w-[158px] rounded-md border border-line-strong bg-[color:var(--color-surface-2)] p-[5px] shadow-lg shadow-black/60 outline-none'>
            {SUPPORTED_LOCALES.map((value) => {
              const on = value === locale;
              return (
                <Menu.Item
                  key={value}
                  onClick={() => apply(value)}
                  className={`flex cursor-pointer items-center justify-between rounded-[4px] px-[9px] py-[7px] text-[12.5px] outline-none ${
                    on
                      ? 'bg-[color:var(--color-line)] text-gold'
                      : 'text-[color:var(--color-muted)] data-[highlighted]:text-fg'
                  }`}
                >
                  {LANGUAGE_NAMES[value]}
                  {on ? <span aria-hidden className='text-[11px]'>✓</span> : null}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
