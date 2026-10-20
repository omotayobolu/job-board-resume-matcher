import { Add, Document, Send } from "iconsax-reactjs";
import PaperClip from "../assets/paper-icon.svg";
import { useState } from "react";
import { useParams } from "react-router";

const Messages = () => {
  const { userId } = useParams();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  return (
    <div className="py-10 px-6 flex flex-row items-start gap-6 font-inter min-h-screen h-full">
      <div className="w-[30%] h-full">
        <div className="min-h-[90vh] overflow-y-auto border-2 border-[rgba(229,229,229,1)] rounded-4xl p-8 bg-white">
          <h2 className="text-black text-2xl font-semibold">Messages</h2>
          <p className="mt-6.5 text-sm text-[#4A4A4A]">No conversations yet.</p>
        </div>
      </div>
      <div className="w-[70%] h-full">
        {userId ? (
          <div className="min-h-[90vh] pt-6 px-11 pb-14 overflow-y-auto border-2 border-[rgba(229,229,229,1)] rounded-4xl bg-white relative">
            <p className="text-sm text-[#4A4A4A] text-center">
              No messages yet.
            </p>

            <div className="absolute bottom-10 left-6 right-6 p-2.5 border border-[#E5E5E5] bg-[#F5F7FB] rounded-[26px]">
              <div className="">
                {selectedFiles.length > 0 && (
                  <ul className="flex flex-row items-center flex-wrap gap-2">
                    {selectedFiles.map((file, index) => (
                      <li
                        key={index}
                        className="text-sm relative text-black flex flex-row items-center gap-1 px-2 pt-5 pb-2 border border-[#E5E5E5] rounded-lg bg-white "
                      >
                        <Document variant="Linear" className="flex-shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <button
                          className="absolute top-1 right-1 cursor-pointer"
                          onClick={() => {
                            const updatedFiles = selectedFiles.filter(
                              (_, i) => i !== index,
                            );
                            setSelectedFiles(updatedFiles);
                          }}
                        >
                          <Add
                            size={20}
                            color="#000000"
                            variant="Linear"
                            className="rotate-45"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-row items-center w-full">
                <label htmlFor="attach-file" className="cursor-pointer">
                  <img src={PaperClip} alt="Attach file" />
                  <input
                    type="file"
                    id="attach-file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setSelectedFiles(files);
                    }}
                  />
                </label>
                <input
                  type="text"
                  className="w-full bg-transparent outline-none text-base text-black pl-5.5 flex-1"
                />
                <button className="bg-white rounded-[3rem] w-12 h-12 flex items-center justify-center cursor-pointer">
                  <Send variant="Bold" size={24} color="#434448" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full h-full  flex flex-col items-center justify-center gap-6">
            <div className="border border-border bg-[#F5F7FB] py-2 px-9 rounded-2xl">
              <h3 className="font-medium text-lg text-[#2B2929]">
                Select a chat to start messaging
              </h3>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Messages;
