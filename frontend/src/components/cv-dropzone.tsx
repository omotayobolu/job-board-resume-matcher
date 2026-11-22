import { useRef, useState } from "react";

type CvDropzoneProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export default function CvDropzone({ files, onChange, disabled }: CvDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const seen = new Set(files.map(fileKey));
    const next = [...files];
    for (const file of incoming) {
      const key = fileKey(file);
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(file);
    }
    onChange(next);
  };

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(event.dataTransfer.files);
        }}
        className={`w-full rounded-2xl border-2 border-dashed bg-white px-6 py-10 text-center ${
          dragging ? "border-purple" : "border-[#E5E5E5]"
        } disabled:opacity-50`}
      >
        <p className="text-lg font-medium text-black">Drop CVs here, or click to choose</p>
        <p className="mt-2 text-sm text-[#4A4A4A]">
          PDF or DOCX, up to 10 MB each. A zip can be up to 50 MB. At most 100 CVs per screening.
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.docx,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {files.map((file) => (
            <li
              key={fileKey(file)}
              className="flex items-center justify-between rounded-xl border border-[#E5E5E5] bg-white px-4 py-2"
            >
              <span className="text-sm text-black">{file.name}</span>
              <button
                type="button"
                className="text-sm text-[#CC2424]"
                onClick={() => onChange(files.filter((item) => fileKey(item) !== fileKey(file)))}
                disabled={disabled}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
