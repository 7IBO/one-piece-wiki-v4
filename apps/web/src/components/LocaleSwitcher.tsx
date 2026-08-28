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
import { useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { type Locale, SUPPORTED_LOCALES, t } from '../lib/chrome';
import { LOCALE_COOKIE, useLocale } from '../routes/__root';

/** Chaque langue nommée dans sa propre langue, comme la planche. */
const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  fr: 'Français',
};

export function LocaleSwitcher(): ReactElement {
  const router = useRouter();
  const locale = useLocale();

  const apply = (next: Locale): void => {
    if (next === locale) return;
    // Un seul petit cookie propriétaire ; l'API Cookie Store
    // asynchrone n'est pas universelle et une bibliothèque serait
    // disproportionnée pour une écriture.
    // oxlint-disable-next-line unicorn/no-document-cookie
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    void router.invalidate();
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
