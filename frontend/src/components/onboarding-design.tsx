const OnboardingDesign = () => {
  return (
    <div className="bg-purple lg:w-[40%] px-12 py-6 lg:flex hidden flex-col justify-between items-start">
      <h2 className="font-medium text-[2.5rem] text-white">jb</h2>
      <div className="">
        <h1 className="text-white font-bold 2xl:text-[4rem] lg:text-5xl text-3xl leading-[80px]">
          Hire Better, <br /> Apply Smarter.
        </h1>
        <p className="text-light-grey text-2xl mt-8 leading-8 font-medium">
          From intelligent job-candidate matching to skill-based
          recommendations, JobBoard connects talent and opportunity with
          precision.
        </p>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-2 whitespace-normal">
        <div className="bg-white rounded-[2.5rem] flex flex-row items-center p-2 gap-2 pl-3">
          <p className="text-xl font-medium text-black">Hiring talent?</p>
          <div className="bg-purple rounded-[2.5rem] border border-black py-3 px-6.5 text-white">
            Post job
          </div>
        </div>
        <div className="bg-white rounded-[2.5rem] flex flex-row items-center p-2 gap-2 pl-3">
          <p className="text-xl font-medium text-black">Looking for a job?</p>
          <div className="bg-purple rounded-[2.5rem] border border-black py-3 px-6.5 text-white">
            Get matched
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingDesign;
