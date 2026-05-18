export function CprGateBanner({ count, onConfirm }: { count: number; onConfirm: () => void }) {
  return (
    <div className="bg-yellow-100 border border-rule p-4 text-ink text-sm mb-6">
      <div className="font-semibold mb-2">
        CPR 31.22 - implied undertaking · action required
      </div>
      <p className="leading-relaxed mb-3">
        {count} chronology {count === 1 ? "entry traces" : "entries trace"} to documents obtained
        under disclosure. CPR 31.22(1) restricts use of disclosed material to the proceedings in
        which it was disclosed. Until you acknowledge the implied undertaking, the server
        withholds detail of those {count === 1 ? "entry" : "entries"} - the rows below show them
        as redacted.
      </p>
      <p className="text-prose leading-relaxed mb-4">
        Acknowledgement is recorded in the audit trail (action:{" "}
        <span className="font-mono text-xs text-ink">chronology.gate.confirmed</span>) and scoped
        to this matter and user.
      </p>
      <button
        onClick={onConfirm}
        className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px]"
      >
        I confirm
      </button>
    </div>
  );
}
