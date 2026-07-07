export default function UserNotRegisteredError() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="font-heading text-xl font-semibold mb-2">Account not registered</h1>
      <p className="text-muted-foreground text-sm max-w-md">
        Your account is not registered for this app. Contact an administrator if you believe this is a mistake.
      </p>
    </div>
  );
}
