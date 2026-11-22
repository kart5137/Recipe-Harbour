import { dict, type Locale } from "@/lib/i18n";

const LINK = "underline decoration-line underline-offset-4 hover:text-ink";

export function SiteFooter({ lang }: { lang: Locale }) {
  const t = dict(lang).footer;
  return (
    <footer className="mt-16 border-t border-line/70">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-8 text-sm text-muted sm:px-6">
        <p>
          {t.recipesFrom}{" "}
          <a className={LINK} href="https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents" hrefLang="en">
            {t.cookbook}
          </a>{" "}
          {t.and}{" "}
          <a className={LINK} href="https://de.wikibooks.org/wiki/Kochbuch" hrefLang="de">
            {t.kochbuch}
          </a>
          {t.writtenBy}{" "}
          <a className={LINK} href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>
          {t.reformatted}
        </p>
        <p>
          {t.rebuild} <em>RecipeHarbor</em>
          {t.team}
        </p>
      </div>
    </footer>
  );
}
