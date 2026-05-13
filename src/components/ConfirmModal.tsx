interface Props {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center">
      <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl p-5 max-w-sm w-full mx-4">
        <p className="text-sm text-zinc-200 whitespace-pre-line">{message}</p>
        <div className="flex gap-3 justify-end mt-5">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs hover:bg-zinc-700 rounded text-zinc-400 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 rounded text-white font-medium transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
