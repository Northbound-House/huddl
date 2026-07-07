import { Link } from 'react-router-dom';

export default function PageNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="font-heading text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-muted-foreground text-sm mb-6">That route does not exist.</p>
      <Link to="/" className="text-primary font-medium hover:underline">
        Back to Huddl
      </Link>
    </div>
  );
}
