import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button-variants';

/** Catch-all 404 for unknown client-side routes. */
export function NotFound() {
  return (
    <section className="space-y-4 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-muted-foreground">This page could not be found.</p>
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>
        Back to dashboard
      </Link>
    </section>
  );
}
