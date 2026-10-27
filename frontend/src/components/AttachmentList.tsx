const isImage = (url: string) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) || url.includes('/image/upload/');

export default function AttachmentList({ urls, light = false }: { urls?: string[]; light?: boolean }) {
    if (!urls || urls.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {urls.map((url, idx) =>
                isImage(url) ? (
                    <a key={idx} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Attachment ${idx + 1}`} className="w-14 h-14 object-cover rounded border border-neutral-200" />
                    </a>
                ) : (
                    <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-xs underline ${light ? 'text-white' : 'text-teal-700'}`}
                    >
                        Attachment {idx + 1}
                    </a>
                )
            )}
        </div>
    );
}
