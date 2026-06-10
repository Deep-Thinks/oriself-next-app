// web/app/letters/new/loading.tsx
/** createLetter RTT 期间的等待帧 · 与封缄仪式同一套节奏语言，不引入新设计元素。 */
export default function NewLetterLoading() {
  return (
    <main className="fixed inset-0 bg-paper flex items-center justify-center">
      <p className="fraunces-body italic text-[17px] text-ink-soft">
        正在备纸<span className="writing-cursor" aria-hidden />
      </p>
    </main>
  );
}
