import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url,
).toString();

export default function ResumePdf({ file }: { file: Blob }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(entry.contentRect.width, 900)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className="w-full">
      <Document file={file} onLoadSuccess={({ numPages }) => setPages(numPages)}
        loading={<p role="status">Rendering resume...</p>}
        error={<p role="alert">Could not render this PDF. Try reopening the preview or open the original file.</p>}
        className="flex flex-col items-center gap-4">
        {width > 0 && Array.from({ length: pages }, (_, index) => (
          <Page key={index + 1} pageNumber={index + 1} width={width}
            loading={<p role="status">Loading page {index + 1}...</p>} />
        ))}
      </Document>
    </div>
  );
}
