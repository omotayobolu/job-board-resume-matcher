import { Add, Document, Send } from "iconsax-reactjs";
import PaperClip from "../assets/paper-icon.svg";
import { useState } from "react";

const Messages = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  return (
    <div className="py-10 px-6 flex flex-row items-start gap-6 font-inter">
      <div className="w-[30%] h-full">
        <div className="min-h-[90vh] overflow-y-auto border-2 border-[rgba(229,229,229,1)] rounded-4xl p-8 bg-white">
          <h2 className="text-black text-2xl font-semibold">Messages</h2>
          <div className="mt-6.5">
            <div className="flex flex-row items-center justify-between gap-2 pb-2 border-b-[0.7px] border-[rgba(229,229,229,1)] cursor-pointer">
              <div className="flex flex-row items-center gap-2 flex-1 min-w-0">
                <div className="h-12 w-12 rounded-[3rem] bg-black flex-shrink-0"></div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <h4 className="text-black text-lg font-medium">
                    Ayoade Precious
                  </h4>
                  <p className="text-sm font-normal text-black whitespace-nowrap overflow-hidden text-ellipsis">
                    How many hours in a week would
                  </p>
                </div>
              </div>
              <div className="w-6.5 h-6.5 rounded-3xl bg-purple text-white text-center text-sm  font-normal flex items-center justify-center flex-shrink-0">
                1
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-[70%] h-full">
        <div className="min-h-[90vh] pt-6 px-11 pb-14 overflow-y-auto border-2 border-[rgba(229,229,229,1)] rounded-4xl bg-white relative">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-6">
              <div className="relative h-12 w-12 rounded-[3rem] bg-black flex-shrink-0">
                <div className="bg-[#1D4C23] w-2.5 h-2.5 absolute top-0 right-0 rounded-full"></div>
              </div>
              <h3 className="font-medium text-2xl">Ayoade Precious</h3>
            </div>
            <div className="cursor-pointer">
              <Add
                size={36}
                color="#000000"
                variant="Linear"
                className="rotate-45"
              />
            </div>
          </div>
          <div className="relative flex flex-col flex-grow">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 border border-[#E5E5E5] rounded-2xl py-2 px-9 bg-[#F5F7FB]">
              <p className="text-sm">Monday, 12th June, 2025</p>
            </div>
            <div className="mt-12 flex flex-col gap-6">
              <div className="flex flex-row justify-end items-end gap-1">
                <div className="bg-[#F5F7FB] md:w-[490px] w-[250px] py-6 px-5 rounded-l-[26px] rounded-tr-[26px] text-black relative">
                  Lorem, ipsum dolor sit amet consectetur adipisicing elit.
                  <span className="absolute bottom-1 right-2 text-xs">
                    12:42PM
                  </span>
                </div>
                <div className="h-12 w-12 rounded-[3rem] bg-black flex-shrink-0"></div>
              </div>
              <div className="flex flex-row justify-start items-end gap-1">
                <div className="h-12 w-12 rounded-[3rem] bg-black flex-shrink-0"></div>
                <div className="bg-purple md:w-[490px] w-[250px] py-6 px-5 rounded-r-[26px] rounded-tl-[26px] text-white relative">
                  Lorem, ipsum dolor sit amet consectetur adipisicing elit.
                  <span className="absolute bottom-1 right-3 text-xs">
                    12:42PM
                  </span>
                </div>
              </div>
              <div className="flex flex-row justify-start items-end gap-1">
                <div className="h-12 w-12 rounded-[3rem] bg-black flex-shrink-0"></div>
                <div className="bg-purple w-[100px]  py-3 px-5 rounded-r-[26px] rounded-tl-[26px] text-white relative flex flex-row items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#BFBDBD] animate-bounce"></div>
                  <div className="w-3 h-3 rounded-full bg-[#D1D1D1] animate-bounce delay-150"></div>
                  <div className="w-3 h-3 rounded-full bg-[#E5E5E5] animate-bounce delay-300"></div>
                </div>
              </div>
            </div>
          </div>

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
                            (_, i) => i !== index
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
      </div>
    </div>
  );
};

export default Messages;
