export function Hello({ matterTitle }: { matterTitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Example module</h2>
      <p className="text-stone-600 text-sm">
        Reading from matter: <span className="font-mono">{matterTitle}</span>
      </p>
    </div>
  );
}
