import { NavLink } from "react-router";
import { Element4, LogoutCurve, Sms } from "iconsax-reactjs";

const JobseekerSidebar = () => {
  return (
    <div className="w-[15%] fixed top-0 left-0 h-screen overflow-hidden border-r-2 border-[#E5E5E5] bg-white pl-6 flex flex-col justify-between z-50">
      <nav className="mt-18">
        <NavLink to="/dashboard" end>
          {({ isActive }) => (
            <div
              className="
                 text-lg flex flex-row items-center gap-3"
            >
              <Element4
                size="22"
                variant="Bold"
                color={isActive ? "rgba(110,98,229,1)" : "rgba(41,45,50,1)"}
              />
              <p
                className={`${
                  isActive ? "text-purple font-bold" : "text-black font-normal"
                } text-lg`}
              >
                Dashboard
              </p>
            </div>
          )}
        </NavLink>

        <NavLink to="/dashboard/messages" end>
          {({ isActive }) => (
            <div
              className={`${
                isActive ? "text-purple font-bold" : "text-black font-normal"
              } text-lg flex flex-row items-center gap-3 mt-4 py-3`}
            >
              <Sms
                size="22"
                variant="Bold"
                color={isActive ? "rgba(110,98,229,1)" : "rgba(41,45,50,1)"}
              />{" "}
              <p
                className={`${
                  isActive ? "text-purple font-bold" : "text-black font-normal"
                } text-lg`}
              >
                Messages
              </p>
            </div>
          )}
        </NavLink>
      </nav>

      <button className="flex items-center gap-3 mb-11 cursor-pointer">
        <LogoutCurve
          color="rgba(204, 36, 36, 1)"
          size="24"
          variant="Bold"
          style={{ transform: "rotate(180deg)" }}
        />
        <p className="text-[#CC2424] text-lg font-normal">Log Out</p>
      </button>
    </div>
  );
};

export default JobseekerSidebar;
