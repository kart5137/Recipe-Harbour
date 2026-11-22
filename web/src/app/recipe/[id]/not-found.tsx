import Link from "next/link";

export default function RecipeNotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Recipe not found</h1>
      <p className="mt-3 max-w-xl text-muted">
        There is no recipe at this address. It may have been removed from the cookbook when the data was last
        refreshed.
      </p>
      <Link href="/" className="mt-6 inline-flex rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink">
        Search recipes
      </Link>
    </main>
  );
}
