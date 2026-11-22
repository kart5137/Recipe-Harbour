export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line/70">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-8 text-sm text-muted sm:px-6">
        <p>
          Recipes from the{" "}
          <a className="underline decoration-line underline-offset-4 hover:text-ink" href="https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents">
            Wikibooks Cookbook
          </a>{" "}
          and{" "}
          <a className="underline decoration-line underline-offset-4 hover:text-ink" href="https://de.wikibooks.org/wiki/Kochbuch">
            Kochbuch
          </a>
          , written by their contributors and shared under{" "}
          <a className="underline decoration-line underline-offset-4 hover:text-ink" href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>
          . Reformatted for search.
        </p>
        <p>
          A rebuild of <em>RecipeHarbor</em>, a 2023 VIT Bhopal team project by Karthik Manoj, Yash Raj, Madhav
          Nawab and Kumar Prince.
        </p>
      </div>
    </footer>
  );
}
